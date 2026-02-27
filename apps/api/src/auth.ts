import type { FastifyReply, FastifyRequest } from "fastify";
import argon2 from "argon2";
import { prisma } from "./db.js";
import { authenticateApiKey } from "./services/api-key-service.js";
import { incrementUsageCounter } from "./services/usage-service.js";
import { enforceApiKeyRateLimit } from "./middleware/rate-limit.js";

declare module "fastify" {
  interface FastifyRequest {
    customer?: {
      id: string;
      name: string;
      plan: string;
      quota: number;
      locale: string;
      apiKeyId?: string;
    };
  }
}

export async function requireApiKey(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const apiKey = request.headers["x-api-key"];
  if (!apiKey || typeof apiKey !== "string") {
    void reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "Missing x-api-key header" } });
    return;
  }
  if (!enforceApiKeyRateLimit(request, reply)) return;

  const authenticated = await authenticateApiKey(apiKey);
  if (authenticated) {
    request.customer = authenticated;
    void incrementUsageCounter(authenticated.id, "api_calls").catch(() => undefined);
    return;
  }

  // Backward-compatible fallback for pre-ApiKey seeded environments.
  const customers = await prisma.customer.findMany({ where: { isActive: true } });
  for (const customer of customers) {
    const ok = await argon2.verify(customer.apiKeyHash, apiKey);
    if (ok) {
      request.customer = {
        id: customer.id,
        name: customer.name,
        plan: customer.plan,
        quota: customer.quota,
        locale: customer.locale,
      };
      void incrementUsageCounter(customer.id, "api_calls").catch(() => undefined);
      return;
    }
  }

  void reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "Invalid API key" } });
}
