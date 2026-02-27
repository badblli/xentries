import "dotenv/config";
import { Queue, Worker } from "bullmq";
import Redis from "ioredis";
import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { gatewayEventSchema } from "@xdev/shared";

const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL ?? "redis://redis:6379");
const streamReader = new Redis(process.env.REDIS_URL ?? "redis://redis:6379");
const streamGroup = process.env.INGEST_GROUP ?? "xgateway-workers";
const streamKey = process.env.INGEST_STREAM_KEY ?? "xgateway:events";
const wsChannel = process.env.WS_PUBSUB_CHANNEL ?? "xgateway:realtime";

const webhookMaxAttempts = Number(process.env.WEBHOOK_MAX_ATTEMPTS ?? "8");
const webhookBackoffMs = Number(process.env.WEBHOOK_BACKOFF_MS ?? "5000");

const webhookQueue = new Queue("queue-webhook-delivery", { connection: { url: process.env.REDIS_URL ?? "redis://redis:6379" } });

function sign(body: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(body).digest("hex");
}

async function ensureConsumerGroup(): Promise<void> {
  try {
    await redis.xgroup("CREATE", streamKey, streamGroup, "0", "MKSTREAM");
  } catch (err) {
    const msg = String(err);
    if (!msg.includes("BUSYGROUP")) {
      throw err;
    }
  }
}

async function persistEvent(raw: string): Promise<void> {
  const event = gatewayEventSchema.parse(JSON.parse(raw));

  try {
    const created = await prisma.event.create({
      data: {
        customerId: event.customerId,
        monitorId: event.monitorId,
        type: event.type,
        providerItemId: event.providerItemId,
        payloadJson: event.payload,
        occurredAt: new Date(event.occurredAt),
      },
    });

    const webhooks = await prisma.webhook.findMany({
      where: { customerId: event.customerId, isActive: true },
      select: { id: true },
    });

    for (const hook of webhooks) {
      await webhookQueue.add(
        "deliver",
        {
          eventId: created.id,
          webhookId: hook.id,
          attempt: 1,
        },
        {
          attempts: webhookMaxAttempts,
          backoff: { type: "exponential", delay: webhookBackoffMs },
          removeOnComplete: true,
          removeOnFail: false,
        },
      );
    }

    await redis.publish(wsChannel, JSON.stringify(event));
  } catch (err) {
    const message = String(err);
    if (!message.includes("P2002") && !message.includes("Unique constraint")) {
      throw err;
    }
  }
}

async function consumeLoop(): Promise<void> {
  await ensureConsumerGroup();

  for (;;) {
    const result = await streamReader.xreadgroup(
      "GROUP",
      streamGroup,
      `consumer-${process.pid}`,
      "BLOCK",
      5000,
      "COUNT",
      10,
      "STREAMS",
      streamKey,
      ">",
    );

    if (!result) continue;

    for (const [, records] of result) {
      for (const [id, fields] of records) {
        const payloadIndex = fields.findIndex((v) => v === "payload");
        const payload = payloadIndex >= 0 ? fields[payloadIndex + 1] : undefined;

        if (payload) {
          await persistEvent(payload);
        }

        await streamReader.xack(streamKey, streamGroup, id);
      }
    }
  }
}

new Worker(
  "queue-webhook-delivery",
  async (job) => {
    const payload = job.data as { eventId: string; webhookId: string; attempt: number };
    const event = await prisma.event.findUnique({ where: { id: payload.eventId } });
    const webhook = await prisma.webhook.findUnique({ where: { id: payload.webhookId } });
    if (!event || !webhook || !webhook.isActive) return;

    const normalized = {
      eventVersion: 1,
      type: event.type,
      provider: "x",
      providerItemId: event.providerItemId,
      monitorId: event.monitorId,
      customerId: event.customerId,
      occurredAt: event.occurredAt.toISOString(),
      payload: event.payloadJson,
    };

    const rawBody = JSON.stringify(normalized);
    const signature = sign(rawBody, webhook.secret);
    const startedAt = Date.now();
    let res: Response;
    try {
      res = await fetch(webhook.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-signature": signature,
          "x-event-type": event.type,
          "x-event-id": event.id,
          "x-event-version": "1",
        },
        body: rawBody,
      });
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      await prisma.webhookDeliveryAttempt.create({
        data: {
          eventId: event.id,
          webhookId: webhook.id,
          attempt: job.attemptsMade + 1,
          status: "failed",
          responseCode: null,
          responseBody: String(error),
          requestId: null,
          durationMs,
          nextRetryAt: new Date(Date.now() + Math.min(webhookBackoffMs * 2 ** job.attemptsMade, 300000)),
        },
      });
      throw error;
    }

    const responseBody = await res.text();
    const durationMs = Date.now() - startedAt;
    const requestId = res.headers.get("x-request-id");

    await prisma.webhookDeliveryAttempt.create({
      data: {
        eventId: event.id,
        webhookId: webhook.id,
        attempt: job.attemptsMade + 1,
        status: res.ok ? "delivered" : "failed",
        responseCode: res.status,
        responseBody,
        requestId: requestId ?? null,
        durationMs,
        nextRetryAt: res.ok
          ? null
          : new Date(Date.now() + Math.min(webhookBackoffMs * 2 ** job.attemptsMade, 300000)),
      },
    });

    if (!res.ok) {
      throw new Error(`Webhook failed with ${res.status}`);
    }

    await prisma.usageCounter
      .upsert({
        where: {
          customerId_metric: {
            customerId: event.customerId,
            metric: "events_delivered",
          },
        },
        create: {
          customerId: event.customerId,
          metric: "events_delivered",
          value: 1,
        },
        update: {
          value: { increment: 1 },
        },
      })
      .catch(() => undefined);
  },
  {
    connection: { url: process.env.REDIS_URL ?? "redis://redis:6379" },
  },
);

new Worker(
  "queue-extraction",
  async (job) => {
    const data = job.data as { extractionJobId: string; customerId: string };
    const extraction = await prisma.extractionJob.findUnique({ where: { id: data.extractionJobId } });
    if (!extraction) return;

    await prisma.extractionJob.update({
      where: { id: extraction.id },
      data: { status: "running", progress: 10, startedAt: new Date() },
    });

    const params = extraction.paramsJson as Record<string, string>;
    const tool = extraction.tool ?? (extraction.kind === "user_tweets" ? "x.user_posts" : "x.search_results");
    const token = decodeURIComponent(process.env.X_BEARER_TOKEN ?? process.env.TWITTER_BEARER_TOKEN ?? process.env.BEARER_TOKEN ?? "");
    if (!token) {
      await prisma.extractionJob.update({
        where: { id: extraction.id },
        data: {
          status: "failed",
          progress: 100,
          errorMessage: "PROVIDER_UNAVAILABLE: bearer token is missing",
          finishedAt: new Date(),
        },
      });
      return;
    }

    const requestX = async (path: string, search?: Record<string, string | undefined>) => {
      const url = new URL(`https://api.x.com/2${path}`);
      for (const [key, value] of Object.entries(search ?? {})) {
        if (value) url.searchParams.set(key, value);
      }
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        throw new Error(`PROVIDER_ERROR:${res.status}`);
      }
      return res.json() as Promise<{ data?: unknown[]; includes?: Record<string, unknown> }>;
    };

    const resolveUserId = async (userId?: string, username?: string) => {
      if (userId) return userId;
      if (!username) throw new Error("userId or username is required");
      const user = await requestX("/users/by/username/" + encodeURIComponent(username));
      const row = (user as { data?: { id?: string } }).data;
      if (!row?.id) throw new Error("user not found");
      return row.id;
    };

    try {
      let result: unknown[] = [];
      if (tool === "x.search_results") {
        const json = await requestX("/tweets/search/recent", { query: params.query ?? "from:xdev", max_results: "100" });
        result = json.data ?? [];
      } else if (tool === "x.tweet_replies") {
        const tweetId = params.tweetId;
        if (!tweetId) throw new Error("tweetId is required");
        const json = await requestX("/tweets/search/recent", { query: `conversation_id:${tweetId}`, max_results: "100" });
        result = json.data ?? [];
      } else if (tool === "x.tweet_quotes") {
        const tweetId = params.tweetId;
        if (!tweetId) throw new Error("tweetId is required");
        const json = await requestX(`/tweets/${tweetId}/quote_tweets`, { max_results: "100" });
        result = json.data ?? [];
      } else if (tool === "x.tweet_retweets") {
        const tweetId = params.tweetId;
        if (!tweetId) throw new Error("tweetId is required");
        const json = await requestX(`/tweets/${tweetId}/retweeted_by`, { max_results: "100" });
        result = json.data ?? [];
      } else if (tool === "x.user_followers") {
        const id = await resolveUserId(params.userId, params.username);
        const json = await requestX(`/users/${id}/followers`, { max_results: "100" });
        result = json.data ?? [];
      } else if (tool === "x.user_following") {
        const id = await resolveUserId(params.userId, params.username);
        const json = await requestX(`/users/${id}/following`, { max_results: "100" });
        result = json.data ?? [];
      } else if (tool === "x.user_posts") {
        const id = await resolveUserId(params.userId, params.username);
        const json = await requestX(`/users/${id}/tweets`, { max_results: "100" });
        result = json.data ?? [];
      } else if (tool === "x.mentions") {
        const mentionQuery =
          params.query ??
          (params.username ? `to:@${params.username} OR @${params.username}` : params.userId ? `@${params.userId}` : "");
        if (!mentionQuery) throw new Error("query or username/userId is required");
        const json = await requestX("/tweets/search/recent", { query: mentionQuery, max_results: "100" });
        result = json.data ?? [];
      } else if (tool === "x.people_search") {
        const query = params.query;
        if (!query) throw new Error("query is required");
        const json = await requestX("/tweets/search/recent", { query, max_results: "100" });
        result = json.data ?? [];
      } else if (tool === "x.thread") {
        const tweetId = params.tweetId;
        if (!tweetId) throw new Error("tweetId is required");
        const json = await requestX("/tweets/search/recent", { query: `conversation_id:${tweetId}`, max_results: "100" });
        result = json.data ?? [];
      } else {
        throw new Error(`TOOL_NOT_AVAILABLE:${tool}`);
      }

      await prisma.extractionJob.update({
        where: { id: extraction.id },
        data: {
          status: "completed",
          progress: 100,
          resultJson: result,
          errorMessage: null,
          finishedAt: new Date(),
        },
      });

      await prisma.usageCounter
        .upsert({
          where: {
            customerId_metric: {
              customerId: extraction.customerId,
              metric: "extraction_rows",
            },
          },
          create: {
            customerId: extraction.customerId,
            metric: "extraction_rows",
            value: Array.isArray(result) ? result.length : 0,
          },
          update: {
            value: { increment: Array.isArray(result) ? result.length : 0 },
          },
        })
        .catch(() => undefined);
    } catch (error) {
      await prisma.extractionJob.update({
        where: { id: extraction.id },
        data: {
          status: "failed",
          progress: 100,
          errorMessage: String(error),
          finishedAt: new Date(),
        },
      });
      throw error;
    }
  },
  {
    connection: { url: process.env.REDIS_URL ?? "redis://redis:6379" },
  },
);

consumeLoop().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  await redis.quit();
  await streamReader.quit();
  process.exit(1);
});
