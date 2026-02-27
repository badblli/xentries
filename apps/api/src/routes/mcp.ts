import type { FastifyPluginAsync } from "fastify";
import { requireApiKey } from "../auth.js";
import { getMcpToolList, handleMcpRpc } from "../mcp/server.js";

const mcpRoutes: FastifyPluginAsync = async (app) => {
  app.post("/mcp", { preHandler: requireApiKey }, async (request, reply) => {
    const customer = request.customer;
    if (!customer) return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } });

    const response = await handleMcpRpc(customer.id, request.body);
    return reply.send(response);
  });

  app.post("/api/mcp", { preHandler: requireApiKey }, async (request, reply) => {
    const customer = request.customer;
    if (!customer) return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } });

    const response = await handleMcpRpc(customer.id, request.body);
    return reply.send(response);
  });

  app.get("/mcp", { preHandler: requireApiKey }, async (request, reply) => {
    const customer = request.customer;
    if (!customer) return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } });

    return {
      transport: "streamable-http",
      auth: "x-api-key",
      tools: getMcpToolList(),
    };
  });
};

export default mcpRoutes;
