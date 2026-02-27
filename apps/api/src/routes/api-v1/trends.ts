import type { FastifyPluginAsync } from "fastify";
import { getTrendsResponse } from "../../services/trends-service.js";

const trendsRoutes: FastifyPluginAsync = async (app) => {
  app.get("/trends", async (request, reply) => {
    const customer = request.customer;
    if (!customer) return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } });

    const query = request.query as { region?: string };
    return getTrendsResponse(query.region);
  });
};

export default trendsRoutes;
