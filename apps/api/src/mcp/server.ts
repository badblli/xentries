import { Queue } from "bullmq";
import crypto from "node:crypto";
import {
  createExtractionRequestSchema,
  createMonitorSchema,
  createWebhookSchema,
  mcpToolSchemas,
} from "@xdev/shared";
import { z } from "zod";
import { config } from "../config.js";
import { prisma } from "../db.js";
import { searchTweets } from "../provider.js";
import { createMonitor, listMonitors, updateMonitor } from "../services/monitor-service.js";
import { listEvents } from "../services/event-service.js";
import { createWebhook, listWebhooks } from "../services/webhook-service.js";
import { enforceExportLimit, exportCsv, exportJson, exportMarkdown, exportXlsx, extractionRows } from "../services/extraction-export-service.js";
import { getExtractionTool, mapToolToLegacyKind } from "../services/extraction-tool-registry.js";

const extractionQueue = new Queue("queue-extraction", { connection: { url: config.redisUrl } });

const toolDefinitions = [
  { name: "list_monitors", description: "List monitors for the authenticated customer." },
  { name: "create_monitor", description: "Create a monitor." },
  { name: "update_monitor", description: "Update a monitor by id." },
  { name: "list_events", description: "List events with cursor pagination." },
  { name: "search_tweets", description: "Search tweets through official X provider API." },
  { name: "create_extraction", description: "Create an async extraction job." },
  { name: "get_extraction", description: "Get extraction details and paged rows." },
  { name: "export_extraction", description: "Export extraction results in json/csv/xlsx/md." },
  { name: "create_webhook", description: "Create webhook endpoint for event delivery." },
  { name: "list_webhooks", description: "List webhooks for the authenticated customer." },
] as const;

const mcpInitializeSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string(), z.number(), z.null()]).optional(),
  method: z.string(),
  params: z.unknown().optional(),
});

const toolsCallSchema = z.object({
  name: z.string(),
  arguments: z.record(z.unknown()).optional(),
});

type JsonRpcRequest = z.infer<typeof mcpInitializeSchema>;

function success(id: JsonRpcRequest["id"], result: unknown) {
  return { jsonrpc: "2.0", id: id ?? null, result };
}

function failure(id: JsonRpcRequest["id"], code: number, message: string, data?: unknown) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message, data } };
}

function mcpContent(payload: unknown) {
  return {
    content: [{ type: "text", text: JSON.stringify(payload) }],
    structuredContent: payload,
  };
}

async function callTool(customerId: string, name: string, args: Record<string, unknown>) {
  if (name === "list_monitors") {
    return { items: await listMonitors(customerId) };
  }

  if (name === "create_monitor") {
    const parsed = createMonitorSchema.safeParse(args);
    if (!parsed.success) {
      throw new Error("VALIDATION_ERROR:create_monitor");
    }
    return createMonitor(customerId, parsed.data as never);
  }

  if (name === "update_monitor") {
    const parsed = z.object({ id: z.string(), patch: z.record(z.unknown()) }).safeParse(args);
    if (!parsed.success) {
      throw new Error("VALIDATION_ERROR:update_monitor");
    }
    const updated = await updateMonitor(customerId, parsed.data.id, parsed.data.patch as never);
    if (!updated) {
      throw new Error("NOT_FOUND:monitor");
    }
    return updated;
  }

  if (name === "list_events") {
    const parsed = z
      .object({
        cursor: z.string().optional(),
        limit: z.number().int().min(1).max(100).optional(),
        monitorId: z.string().optional(),
        type: z.string().optional(),
        since: z.string().optional(),
        until: z.string().optional(),
      })
      .safeParse(args);
    if (!parsed.success) {
      throw new Error("VALIDATION_ERROR:list_events");
    }
    return listEvents(customerId, parsed.data);
  }

  if (name === "search_tweets") {
    const parsed = z
      .object({ query: z.string().min(1), sinceId: z.string().optional(), maxResults: z.number().int().min(10).max(100).optional() })
      .safeParse(args);
    if (!parsed.success) {
      throw new Error("VALIDATION_ERROR:search_tweets");
    }
    return searchTweets(parsed.data.query, { customerId, sinceId: parsed.data.sinceId, maxResults: parsed.data.maxResults });
  }

  if (name === "create_extraction") {
    const parsed = createExtractionRequestSchema.safeParse(args);
    if (!parsed.success) {
      throw new Error("VALIDATION_ERROR:create_extraction");
    }

    const entry = getExtractionTool(parsed.data.tool);
    if (!entry) {
      throw new Error("VALIDATION_ERROR:unknown_tool");
    }
    if (!entry.implemented) {
      throw new Error("TOOL_NOT_AVAILABLE:coming_soon");
    }

    const paramsChecked = entry.paramsSchema.safeParse(parsed.data.params);
    if (!paramsChecked.success) {
      throw new Error("VALIDATION_ERROR:invalid_tool_params");
    }

    const kind = mapToolToLegacyKind(parsed.data.tool);
    const job = await prisma.extractionJob.create({
      data: {
        customerId,
        tool: parsed.data.tool,
        kind,
        paramsJson: paramsChecked.data,
        status: "queued",
        progress: 0,
      },
    });

    await extractionQueue.add("run", { extractionJobId: job.id, customerId }, { removeOnComplete: true, removeOnFail: false });
    return { id: job.id, tool: job.tool, status: job.status, progress: job.progress, createdAt: job.createdAt };
  }

  if (name === "get_extraction") {
    const parsed = z.object({ id: z.string(), offset: z.number().int().min(0).optional(), limit: z.number().int().min(1).max(5000).optional() }).safeParse(args);
    if (!parsed.success) {
      throw new Error("VALIDATION_ERROR:get_extraction");
    }

    const item = await prisma.extractionJob.findFirst({ where: { id: parsed.data.id, customerId } });
    if (!item) {
      throw new Error("NOT_FOUND:extraction");
    }

    const offset = parsed.data.offset ?? 0;
    const limit = parsed.data.limit ?? 100;
    const page = extractionRows(item.resultJson, offset, limit);

    return {
      id: item.id,
      tool: item.tool,
      status: item.status,
      progress: item.progress,
      errorMessage: item.errorMessage,
      createdAt: item.createdAt,
      startedAt: item.startedAt,
      finishedAt: item.finishedAt,
      rows: {
        total: page.total,
        offset,
        limit,
        items: page.items,
      },
    };
  }

  if (name === "export_extraction") {
    const parsed = z.object({ id: z.string(), format: z.enum(["json", "csv", "xlsx", "md"]) }).safeParse(args);
    if (!parsed.success) {
      throw new Error("VALIDATION_ERROR:export_extraction");
    }

    const item = await prisma.extractionJob.findFirst({ where: { id: parsed.data.id, customerId } });
    if (!item) {
      throw new Error("NOT_FOUND:extraction");
    }
    if (item.status !== "completed" || !item.resultJson) {
      throw new Error("NOT_READY:extraction");
    }

    const limitCheck = enforceExportLimit(item.resultJson);
    if (!limitCheck.ok) {
      throw new Error("EXPORT_LIMIT_EXCEEDED");
    }

    if (parsed.data.format === "json") {
      return { format: "json", content: exportJson(item.resultJson) };
    }
    if (parsed.data.format === "csv") {
      return { format: "csv", content: exportCsv(item.resultJson) };
    }
    if (parsed.data.format === "md") {
      return { format: "md", content: exportMarkdown(item.resultJson) };
    }

    return {
      format: "xlsx",
      encoding: "base64",
      content: exportXlsx(item.resultJson).toString("base64"),
    };
  }

  if (name === "create_webhook") {
    const parsed = createWebhookSchema.safeParse(args);
    if (!parsed.success) {
      throw new Error("VALIDATION_ERROR:create_webhook");
    }

    return createWebhook(customerId, {
      url: parsed.data.url,
      isActive: parsed.data.isActive,
      secret: crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, ""),
    });
  }

  if (name === "list_webhooks") {
    return { items: await listWebhooks(customerId) };
  }

  throw new Error("METHOD_NOT_FOUND");
}

export async function handleMcpRpc(customerId: string, payload: unknown) {
  const parsedRequest = mcpInitializeSchema.safeParse(payload);
  if (!parsedRequest.success) {
    return failure(null, -32600, "Invalid Request", parsedRequest.error.flatten());
  }

  const req = parsedRequest.data;

  if (req.method === "initialize") {
    return success(req.id, {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "xentries-mcp", version: "1.0.0" },
    });
  }

  if (req.method === "tools/list") {
    return success(req.id, {
      tools: toolDefinitions.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: mcpToolSchemas[tool.name] ?? { type: "object" },
      })),
    });
  }

  if (req.method === "tools/call") {
    const parsedCall = toolsCallSchema.safeParse(req.params ?? {});
    if (!parsedCall.success) {
      return failure(req.id, -32602, "Invalid params", parsedCall.error.flatten());
    }

    try {
      const result = await callTool(customerId, parsedCall.data.name, parsedCall.data.arguments ?? {});
      return success(req.id, mcpContent(result));
    } catch (error) {
      return failure(req.id, -32000, String(error));
    }
  }

  return failure(req.id, -32601, "Method not found");
}

export function getMcpToolList() {
  return toolDefinitions.map((tool) => ({
    ...tool,
    inputSchema: mcpToolSchemas[tool.name] ?? { type: "object" },
  }));
}
