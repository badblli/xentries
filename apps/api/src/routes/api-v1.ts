import type { FastifyPluginAsync } from "fastify";
import { requireApiKey } from "../auth.js";
import accountRoutes from "./api-v1/account.js";
import apiKeyRoutes from "./api-v1/api-keys.js";
import monitorRoutes from "./api-v1/monitors.js";
import eventRoutes from "./api-v1/events.js";
import providerStatusRoutes from "./api-v1/provider-status.js";
import webhookRoutes from "./api-v1/webhooks.js";
import extractionRoutes from "./api-v1/extractions.js";
import trendsRoutes from "./api-v1/trends.js";

const apiV1Routes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", requireApiKey);
  await app.register(accountRoutes);
  await app.register(apiKeyRoutes);
  await app.register(monitorRoutes);
  await app.register(eventRoutes);
  await app.register(webhookRoutes);
  await app.register(extractionRoutes);
  await app.register(trendsRoutes);
  await app.register(providerStatusRoutes);
};

export default apiV1Routes;
