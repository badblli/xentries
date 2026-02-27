import type { FastifyPluginAsync } from "fastify";
import { createExtractionRequestSchema } from "@xdev/shared";
import { sendNotFound, sendValidationError } from "../../http/errors.js";
import { prisma } from "../../db.js";
import { Queue } from "bullmq";
import { config } from "../../config.js";
import {
  enforceExportLimit,
  exportCsv,
  exportJson,
  exportMarkdown,
  exportXlsx,
  extractionRows,
} from "../../services/extraction-export-service.js";
import { getExtractionTool, mapToolToLegacyKind } from "../../services/extraction-tool-registry.js";

const extractionQueue = new Queue("queue-extraction", { connection: { url: config.redisUrl } });

const extractionRoutes: FastifyPluginAsync = async (app) => {
  app.post("/extractions", async (request, reply) => {
    const customer = request.customer;
    if (!customer) return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } });

    const parsed = createExtractionRequestSchema.safeParse(request.body);
    if (!parsed.success) return sendValidationError(reply, parsed.error.flatten());

    const entry = getExtractionTool(parsed.data.tool);
    if (!entry) {
      return reply.code(400).send({ error: { code: "VALIDATION_ERROR", message: "Unknown extraction tool" } });
    }

    if (!entry.implemented) {
      return reply.code(409).send({
        error: {
          code: "TOOL_NOT_AVAILABLE",
          message: "Tool is marked as coming soon.",
          details: { tool: parsed.data.tool, comingSoon: true },
        },
      });
    }

    const paramsChecked = entry.paramsSchema.safeParse(parsed.data.params);
    if (!paramsChecked.success) {
      return sendValidationError(reply, paramsChecked.error.flatten());
    }

    const kind = mapToolToLegacyKind(parsed.data.tool);
    const job = await prisma.extractionJob.create({
      data: {
        customerId: customer.id,
        tool: parsed.data.tool,
        kind,
        paramsJson: paramsChecked.data,
        status: "queued",
        progress: 0,
      },
    });

    await extractionQueue.add("run", { extractionJobId: job.id, customerId: customer.id }, { removeOnComplete: true, removeOnFail: false });

    return reply.code(201).send({
      id: job.id,
      tool: job.tool,
      status: job.status,
      progress: job.progress,
      createdAt: job.createdAt,
    });
  });

  app.get("/extractions", async (request, reply) => {
    const customer = request.customer;
    if (!customer) return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } });

    const items = await prisma.extractionJob.findMany({ where: { customerId: customer.id }, orderBy: { createdAt: "desc" } });
    return {
      items: items.map((item) => ({
        id: item.id,
        tool: item.tool,
        status: item.status,
        progress: item.progress,
        errorMessage: item.errorMessage,
        createdAt: item.createdAt,
        startedAt: item.startedAt,
        finishedAt: item.finishedAt,
      })),
    };
  });

  app.get("/extractions/:id", async (request, reply) => {
    const customer = request.customer;
    if (!customer) return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } });

    const id = (request.params as { id: string }).id;
    const q = request.query as { offset?: string; limit?: string };
    const offset = Math.max(Number(q.offset ?? "0"), 0);
    const limit = Math.min(Math.max(Number(q.limit ?? "100"), 1), 5000);

    const item = await prisma.extractionJob.findFirst({ where: { id, customerId: customer.id } });
    if (!item) return sendNotFound(reply, "Extraction");

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
  });

  app.get("/extractions/:id/export", async (request, reply) => {
    const customer = request.customer;
    if (!customer) return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } });

    const id = (request.params as { id: string }).id;
    const format = ((request.query as { format?: string }).format ?? "json").toLowerCase();
    const item = await prisma.extractionJob.findFirst({ where: { id, customerId: customer.id } });
    if (!item) return sendNotFound(reply, "Extraction");
    if (item.status !== "completed" || !item.resultJson) {
      return reply.code(409).send({ error: { code: "NOT_READY", message: "Extraction not completed" } });
    }

    const limitCheck = enforceExportLimit(item.resultJson);
    if (!limitCheck.ok) {
      return reply.code(409).send({
        error: {
          code: "EXPORT_LIMIT_EXCEEDED",
          message: "Extraction row count exceeds export limit.",
          details: { totalRows: limitCheck.total, maxRows: limitCheck.limit },
        },
      });
    }

    if (format === "json") {
      return reply.header("content-type", "application/json").send(exportJson(item.resultJson));
    }
    if (format === "csv") {
      return reply.header("content-type", "text/csv").send(exportCsv(item.resultJson));
    }
    if (format === "md") {
      return reply.header("content-type", "text/markdown; charset=utf-8").send(exportMarkdown(item.resultJson));
    }
    if (format === "xlsx") {
      const file = exportXlsx(item.resultJson);
      return reply
        .header("content-type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        .send(file);
    }

    return reply.code(400).send({ error: { code: "VALIDATION_ERROR", message: "Unsupported export format" } });
  });

  app.post("/extractions/:id/estimate", async (request, reply) => {
    const customer = request.customer;
    if (!customer) return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } });

    const id = (request.params as { id: string }).id;
    const item = await prisma.extractionJob.findFirst({ where: { id, customerId: customer.id } });
    if (!item) return sendNotFound(reply, "Extraction");

    const limitCheck = enforceExportLimit(item.resultJson);
    return {
      extractionId: id,
      status: item.status,
      estimatedRows: limitCheck.total,
      maxExportRows: limitCheck.limit,
      exportable: limitCheck.ok,
      cappedAt: limitCheck.ok ? null : limitCheck.limit,
    };
  });
};

export default extractionRoutes;
