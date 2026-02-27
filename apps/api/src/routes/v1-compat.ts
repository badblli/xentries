import type { FastifyPluginAsync } from "fastify";
import { legacyCreateMonitorSchema } from "@xdev/shared";
import { sendNotFound, sendValidationError } from "../http/errors.js";
import { getAccount } from "../services/account-service.js";
import { createMonitor, deleteMonitor, getMonitor, legacyMonitorPayload, listMonitors, updateMonitor } from "../services/monitor-service.js";
import { listEvents } from "../services/event-service.js";
import { requireApiKey } from "../auth.js";
import { getProviderStatusResponse } from "../services/provider-status-service.js";
import { getTrendsResponse } from "../services/trends-service.js";

const v1CompatRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", requireApiKey);
  app.get("/settings/provider-status", async (request, reply) => {
    const customer = request.customer;
    if (!customer) return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } });
    return getProviderStatusResponse(customer.id);
  });

  app.get("/trends", async (request, reply) => {
    const customer = request.customer;
    if (!customer) return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } });
    const query = request.query as { region?: string };
    return getTrendsResponse(query.region);
  });

  app.get("/settings/quota", async (request, reply) => {
    const customer = request.customer;
    if (!customer) return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } });
    const account = await getAccount(customer.id);
    if (!account) return sendNotFound(reply, "Account");

    return {
      plan: customer.plan,
      quota: customer.quota,
      used: account.usage.eventsDelivered,
      remaining: Math.max(customer.quota - account.usage.eventsDelivered, 0),
    };
  });

  app.get("/monitors", async (request, reply) => {
    const customer = request.customer;
    if (!customer) return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } });
    const items = await listMonitors(customer.id);
    return {
      items: items.map((item) => ({ ...item, ...legacyMonitorPayload(item) })),
    };
  });

  app.post("/monitors", async (request, reply) => {
    const customer = request.customer;
    if (!customer) return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } });

    const parsed = legacyCreateMonitorSchema.safeParse(request.body);
    if (!parsed.success) return sendValidationError(reply, parsed.error.flatten());

    const kind = parsed.data.type === "user" || parsed.data.type === "mentions" ? "account" : "query";
    const target =
      parsed.data.type === "user"
        ? { userId: parsed.data.query.replace(/^id:/, "") }
        : parsed.data.type === "mentions"
          ? { username: parsed.data.query.replace(/^@/, "") }
          : { query: parsed.data.query };

    const monitor = await createMonitor(customer.id, {
      provider: parsed.data.provider,
      kind,
      target,
      eventTypes: parsed.data.eventTypes,
      pollingIntervalSec: parsed.data.pollingIntervalSec,
      webhookId: parsed.data.webhookId,
      isActive: parsed.data.isActive,
    });

    return reply.code(201).send({ ...monitor, ...legacyMonitorPayload(monitor) });
  });

  app.get("/monitors/:id", async (request, reply) => {
    const customer = request.customer;
    if (!customer) return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } });

    const monitor = await getMonitor(customer.id, (request.params as { id: string }).id);
    if (!monitor) return sendNotFound(reply, "Monitor");

    return { ...monitor, ...legacyMonitorPayload(monitor) };
  });

  app.patch("/monitors/:id", async (request, reply) => {
    const customer = request.customer;
    if (!customer) return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } });

    const body = request.body as Partial<{ type: "keyword" | "user" | "mentions"; query: string; pollingIntervalSec: number; eventTypes: string[]; webhookId: string | null; isActive: boolean }>;
    const patch: Record<string, unknown> = {
      pollingIntervalSec: body.pollingIntervalSec,
      eventTypes: body.eventTypes,
      webhookId: body.webhookId,
      isActive: body.isActive,
    };

    if (body.type && body.query) {
      patch.kind = body.type === "user" || body.type === "mentions" ? "account" : "query";
      patch.target =
        body.type === "user"
          ? { userId: body.query.replace(/^id:/, "") }
          : body.type === "mentions"
            ? { username: body.query.replace(/^@/, "") }
            : { query: body.query };
    }

    const updated = await updateMonitor(customer.id, (request.params as { id: string }).id, patch as never);
    if (!updated) return sendNotFound(reply, "Monitor");

    return { ...updated, ...legacyMonitorPayload(updated) };
  });

  app.delete("/monitors/:id", async (request, reply) => {
    const customer = request.customer;
    if (!customer) return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } });

    const ok = await deleteMonitor(customer.id, (request.params as { id: string }).id);
    if (!ok) return sendNotFound(reply, "Monitor");
    return { status: "deleted" };
  });

  app.get("/events", async (request, reply) => {
    const customer = request.customer;
    if (!customer) return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } });

    const q = request.query as { monitorId?: string; type?: string; page?: string; pageSize?: string; from?: string; to?: string };
    const page = Math.max(Number(q.page ?? "1"), 1);
    const pageSize = Math.min(Math.max(Number(q.pageSize ?? "25"), 1), 100);

    let cursor: string | undefined;
    let items: unknown[] = [];
    for (let i = 0; i < page; i += 1) {
      const batch = await listEvents(customer.id, {
        cursor,
        limit: pageSize,
        monitorId: q.monitorId,
        type: q.type,
        since: q.from,
        until: q.to,
      });
      items = batch.items;
      cursor = batch.nextCursor ?? undefined;
      if (!cursor && i < page - 1) {
        items = [];
        break;
      }
    }

    return {
      items,
      total: items.length,
      page,
      pageSize,
    };
  });
};

export default v1CompatRoutes;
