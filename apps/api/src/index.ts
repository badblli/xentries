import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import websocket from "@fastify/websocket";
import { Queue } from "bullmq";
import Redis from "ioredis";
import { randomBytes } from "node:crypto";
import {
  createExtractionSchema,
  createWebhookSchema,
  gatewayEventSchema,
} from "@xdev/shared";
import { config } from "./config.js";
import { prisma } from "./db.js";
import { requireApiKey } from "./auth.js";
import { getMentionsTimeline, getTweet, getUser, getUserTimeline, searchTweets } from "./provider.js";
import { seedOwnerCustomer } from "./seed-lib.js";
import { signWebhookPayload } from "./security.js";
import { toCsvRows } from "./utils.js";
import { ProviderMappedError } from "./providers/errors.js";
import { providerErrorToJson, jsonError } from "./http/errors.js";
import apiV1Routes from "./routes/api-v1.js";
import v1CompatRoutes from "./routes/v1-compat.js";
import { authenticateApiKey } from "./services/api-key-service.js";
import { parseWsMessage } from "./ws.js";

const app = Fastify({ logger: true, requestIdHeader: "x-request-id", requestIdLogLabel: "requestId" });
const redis = new Redis(config.redisUrl);
const redisSub = new Redis(config.redisUrl);

const extractionQueue = new Queue("queue-extraction", { connection: { url: config.redisUrl } });

type WsClient = { send: (payload: string) => void; close?: () => void };
const wsClients = new Map<string, Set<WsClient>>();

function getCustomer(request: Parameters<typeof requireApiKey>[0]) {
  if (!request.customer) {
    throw new Error("customer not found in request context");
  }
  return request.customer;
}

app.setErrorHandler((error, _request, reply) => {
  if (error instanceof ProviderMappedError) {
    return reply.code(error.statusCode).send(providerErrorToJson(error));
  }
  const status = error.statusCode ?? 500;
  reply.code(status).send(jsonError("INTERNAL_ERROR", error.message));
});

await app.register(cors, { origin: true });
await app.register(rateLimit, {
  max: config.rateLimitMax,
  timeWindow: `${config.rateLimitWindowSec} second`,
  keyGenerator: (req) => String(req.headers["x-api-key"] ?? req.ip),
});
await app.register(swagger, {
  openapi: {
    info: {
      title: "X Gateway API",
      version: "1.0.0",
    },
  },
});
await app.register(swaggerUi, { routePrefix: "/docs" });
await app.register(websocket);

app.get("/health", async () => ({ status: "ok" }));
app.get("/ready", async () => {
  await prisma.$queryRaw`SELECT 1`;
  await redis.ping();
  return { status: "ready" };
});

app.get("/internal/monitors", async (request, reply) => {
  if (request.headers["x-collector-token"] !== config.collectorInternalToken) {
    return reply.code(401).send(jsonError("UNAUTHORIZED", "Invalid collector token"));
  }

  const provider = (request.query as { provider?: string } | undefined)?.provider;
  const monitors = await prisma.monitor.findMany({
    where: {
      isActive: true,
      provider: provider === "x" || provider === "reddit" ? provider : undefined,
    },
    include: { customer: true },
  });

  return {
    items: monitors.map((m) => ({
      id: m.id,
      customerId: m.customerId,
      provider: m.provider,
      type: m.type,
      query: m.query,
      kind: m.kind,
      target: m.targetJson,
      pollingIntervalSec: m.pollingIntervalSec,
      eventTypes: m.eventTypes,
      lastCursor: m.lastCursor,
      customerPlan: m.customer.plan,
    })),
  };
});

app.post("/internal/monitors/:id/cursor", async (request, reply) => {
  if (request.headers["x-collector-token"] !== config.collectorInternalToken) {
    return reply.code(401).send(jsonError("UNAUTHORIZED", "Invalid collector token"));
  }

  const body = request.body as { cursor?: string };
  await prisma.monitor.update({
    where: { id: (request.params as { id: string }).id },
    data: { lastCursor: body.cursor ?? null },
  });

  return { status: "ok" };
});

await app.register(apiV1Routes, { prefix: "/api/v1" });
await app.register(v1CompatRoutes, { prefix: "/v1" });

app.get("/v1/search/tweets", { preHandler: requireApiKey }, async (request, reply) => {
  const customer = getCustomer(request);
  const query = (request.query as { query?: string }).query;
  if (!query) return reply.code(400).send(jsonError("VALIDATION_ERROR", "query is required"));
  try {
    return await searchTweets(query, { customerId: customer.id });
  } catch (error) {
    if (error instanceof ProviderMappedError) {
      return reply.code(error.statusCode).send(providerErrorToJson(error));
    }
    throw error;
  }
});

app.get("/v1/tweets/:id", { preHandler: requireApiKey }, async (request, reply) => {
  const customer = getCustomer(request);
  try {
    return await getTweet((request.params as { id: string }).id, customer.id);
  } catch (error) {
    if (error instanceof ProviderMappedError) {
      return reply.code(error.statusCode).send(providerErrorToJson(error));
    }
    throw error;
  }
});

app.get("/v1/users/:id", { preHandler: requireApiKey }, async (request, reply) => {
  const customer = getCustomer(request);
  try {
    return await getUser((request.params as { id: string }).id, customer.id);
  } catch (error) {
    if (error instanceof ProviderMappedError) {
      return reply.code(error.statusCode).send(providerErrorToJson(error));
    }
    throw error;
  }
});

app.get("/v1/users/:id/timeline", { preHandler: requireApiKey }, async (request, reply) => {
  const customer = getCustomer(request);
  const q = request.query as { sinceId?: string };
  try {
    return await getUserTimeline((request.params as { id: string }).id, {
      sinceId: q.sinceId,
      customerId: customer.id,
    });
  } catch (error) {
    if (error instanceof ProviderMappedError) {
      return reply.code(error.statusCode).send(providerErrorToJson(error));
    }
    throw error;
  }
});

app.get("/v1/users/:id/mentions", { preHandler: requireApiKey }, async (request, reply) => {
  const customer = getCustomer(request);
  const q = request.query as { sinceId?: string };
  try {
    return await getMentionsTimeline((request.params as { id: string }).id, {
      sinceId: q.sinceId,
      customerId: customer.id,
    });
  } catch (error) {
    if (error instanceof ProviderMappedError) {
      return reply.code(error.statusCode).send(providerErrorToJson(error));
    }
    throw error;
  }
});

app.get("/v1/webhooks", { preHandler: requireApiKey }, async (request) => {
  const customer = getCustomer(request);
  const items = await prisma.webhook.findMany({
    where: { customerId: customer.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, url: true, isActive: true, createdAt: true },
  });
  return { items };
});

app.post("/v1/webhooks", { preHandler: requireApiKey }, async (request, reply) => {
  const customer = getCustomer(request);
  const parsed = createWebhookSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.code(400).send(jsonError("VALIDATION_ERROR", "Invalid webhook payload", parsed.error.flatten()));
  }

  const hook = await prisma.webhook.create({
    data: {
      customerId: customer.id,
      url: parsed.data.url,
      secret: randomBytes(24).toString("hex"),
      isActive: parsed.data.isActive ?? true,
    },
    select: { id: true, url: true, isActive: true, createdAt: true },
  });

  return reply.code(201).send(hook);
});

app.delete("/v1/webhooks/:id", { preHandler: requireApiKey }, async (request, reply) => {
  const customer = getCustomer(request);
  const id = (request.params as { id: string }).id;
  const hook = await prisma.webhook.findFirst({ where: { id, customerId: customer.id } });
  if (!hook) return reply.code(404).send(jsonError("NOT_FOUND", "Webhook not found"));
  await prisma.webhook.delete({ where: { id } });
  return { status: "deleted" };
});

app.post("/v1/webhooks/:id/test", { preHandler: requireApiKey }, async (request, reply) => {
  const customer = getCustomer(request);
  const id = (request.params as { id: string }).id;
  const hook = await prisma.webhook.findFirst({ where: { id, customerId: customer.id, isActive: true } });
  if (!hook) return reply.code(404).send(jsonError("NOT_FOUND", "Webhook not found"));

  const sample = gatewayEventSchema.parse({
    eventVersion: 1,
    type: "tweet.new",
    provider: "x",
    providerItemId: `test-${Date.now()}`,
    monitorId: "test-monitor",
    customerId: customer.id,
    occurredAt: new Date().toISOString(),
    payload: {
      tweetId: "123",
      text: "Test webhook event",
      authorId: "u1",
      authorUsername: "tester",
      createdAt: new Date().toISOString(),
      url: "https://x.com/test/status/123",
      metrics: { likeCount: 1, retweetCount: 0, replyCount: 0 },
    },
  });

  const rawBody = JSON.stringify(sample);
  const signature = signWebhookPayload(rawBody, hook.secret);
  const response = await fetch(hook.url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-signature": signature,
      "x-event-type": sample.type,
      "x-event-id": sample.providerItemId,
      "x-event-version": String(sample.eventVersion),
    },
    body: rawBody,
  });

  return { status: "sent", responseCode: response.status };
});

app.post("/v1/extractions", { preHandler: requireApiKey }, async (request, reply) => {
  const customer = getCustomer(request);
  const parsed = createExtractionSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.code(400).send(jsonError("VALIDATION_ERROR", "Invalid extraction payload", parsed.error.flatten()));
  }

  const job = await prisma.extractionJob.create({
    data: {
      customerId: customer.id,
      tool: parsed.data.kind === "user_tweets" ? "x.user_posts" : "x.search_results",
      kind: parsed.data.kind,
      paramsJson: parsed.data.params,
      status: "queued",
      progress: 0,
    },
  });

  await extractionQueue.add("run", { extractionJobId: job.id, customerId: customer.id }, { removeOnComplete: true, removeOnFail: false });

  return reply.code(201).send(job);
});

app.get("/v1/extractions", { preHandler: requireApiKey }, async (request) => {
  const customer = getCustomer(request);
  const items = await prisma.extractionJob.findMany({ where: { customerId: customer.id }, orderBy: { createdAt: "desc" } });
  return { items };
});

app.get("/v1/extractions/:id", { preHandler: requireApiKey }, async (request, reply) => {
  const customer = getCustomer(request);
  const item = await prisma.extractionJob.findFirst({ where: { id: (request.params as { id: string }).id, customerId: customer.id } });
  if (!item) return reply.code(404).send(jsonError("NOT_FOUND", "Extraction not found"));
  return item;
});

app.get("/v1/extractions/:id/download", { preHandler: requireApiKey }, async (request, reply) => {
  const customer = getCustomer(request);
  const query = request.query as { format?: "json" | "csv" };
  const item = await prisma.extractionJob.findFirst({ where: { id: (request.params as { id: string }).id, customerId: customer.id } });
  if (!item) return reply.code(404).send(jsonError("NOT_FOUND", "Extraction not found"));
  if (item.status !== "completed" || !item.resultJson) {
    return reply.code(409).send(jsonError("NOT_READY", "Extraction not completed"));
  }

  if (query.format === "csv") {
    const csv = toCsvRows(item.resultJson as unknown[]);
    return reply.header("content-type", "text/csv").send(csv);
  }

  return reply.header("content-type", "application/json").send(item.resultJson);
});

app.get("/ws", { websocket: true }, (socket, request) => {
  const apiKey = request.headers["x-api-key"];
  if (!apiKey || typeof apiKey !== "string") {
    socket.close(1008, "Missing x-api-key");
    return;
  }

  let active = true;
  authenticateApiKey(apiKey)
    .then((customer) => {
      if (!customer) {
        active = false;
        socket.close(1008, "Invalid api key");
        return;
      }

      const customerId = customer.id;
      const joinedChannels = new Set<string>();

      socket.on("message", (raw) => {
        if (!active || !customerId) return;
        try {
          const message = parseWsMessage(raw);
          if (message.action === "ping") {
            socket.send(JSON.stringify({ status: "pong" }));
            return;
          }

          const channel = `${customerId}:${message.monitorId}`;
          if (!wsClients.has(channel)) wsClients.set(channel, new Set());

          if (message.action === "subscribe") {
            wsClients.get(channel)?.add(socket as unknown as WsClient);
            joinedChannels.add(channel);
            socket.send(JSON.stringify({ status: "subscribed", monitorId: message.monitorId }));
            return;
          }

          wsClients.get(channel)?.delete(socket as unknown as WsClient);
          joinedChannels.delete(channel);
          socket.send(JSON.stringify({ status: "unsubscribed", monitorId: message.monitorId }));
        } catch {
          socket.send(JSON.stringify(jsonError("VALIDATION_ERROR", "Invalid websocket payload")));
        }
      });

      socket.on("close", () => {
        for (const channel of joinedChannels) {
          wsClients.get(channel)?.delete(socket as unknown as WsClient);
        }
      });
    })
    .catch(() => {
      socket.close(1011, "Auth error");
    });
});

redisSub.subscribe(config.wsPubsubChannel).catch((err) => {
  app.log.error(err, "Failed to subscribe websocket pubsub channel");
});

redisSub.on("message", (_channel, message) => {
  try {
    const event = gatewayEventSchema.parse(JSON.parse(message));
    const channel = `${event.customerId}:${event.monitorId}`;
    const set = wsClients.get(channel);
    if (!set || set.size === 0) return;
    const payload = JSON.stringify(event);
    for (const client of set) {
      client.send(payload);
    }
  } catch (err) {
    app.log.warn({ err }, "Failed to parse pubsub websocket event");
  }
});

async function bootstrap() {
  await seedOwnerCustomer();
  await app.listen({ port: config.apiPort, host: "0.0.0.0" });
  app.log.info(`API running on ${config.apiPort}`);
}

bootstrap().catch(async (err) => {
  app.log.error(err);
  await prisma.$disconnect();
  await redis.quit();
  await redisSub.quit();
  process.exit(1);
});
