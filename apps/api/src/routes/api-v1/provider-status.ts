import type { FastifyPluginAsync } from "fastify";
import { getProviderStatusResponse } from "../../services/provider-status-service.js";

const providerStatusRoutes: FastifyPluginAsync = async (app) => {
  app.get("/settings/provider-status", async (request, reply) => {
    const customer = request.customer;
    if (!customer) return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } });

    return getProviderStatusResponse(customer.id);
  });
};

export default providerStatusRoutes;
