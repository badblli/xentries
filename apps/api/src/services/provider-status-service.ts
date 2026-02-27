import { config } from "../config.js";
import { probeXProvider } from "../provider.js";
import { ProviderMappedError } from "../providers/errors.js";
import { resolveXToken } from "../providers/x/token-resolver.js";

const providerStatusTtlMs = 60_000;
const providerStatusCache = new Map<
  string,
  {
    expiresAt: number;
    value: {
      mode: "public" | "customer";
      configured: boolean;
      reachable: boolean;
      authorized: boolean;
      rateLimited: boolean;
      lastCheckedAt: string | null;
      lastError: { code: string; message: string } | null;
    };
  }
>();

export async function getXProviderStatus(customerId: string) {
  const cached = providerStatusCache.get(customerId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const nowIso = new Date().toISOString();
  const token = await resolveXToken(customerId);

  if (!token.token) {
    const missing = {
      mode: token.mode,
      configured: false,
      reachable: false,
      authorized: false,
      rateLimited: false,
      lastCheckedAt: nowIso,
      lastError: { code: "PROVIDER_UNAVAILABLE", message: "Provider token is not configured." },
    } as const;
    providerStatusCache.set(customerId, { expiresAt: Date.now() + providerStatusTtlMs, value: missing });
    return missing;
  }

  try {
    await probeXProvider(customerId);
    const ok = {
      mode: token.mode,
      configured: true,
      reachable: true,
      authorized: true,
      rateLimited: false,
      lastCheckedAt: nowIso,
      lastError: null,
    } as const;
    providerStatusCache.set(customerId, { expiresAt: Date.now() + providerStatusTtlMs, value: ok });
    return ok;
  } catch (error) {
    if (error instanceof ProviderMappedError) {
      const failing = {
        mode: token.mode,
        configured: true,
        reachable: error.code !== "PROVIDER_UNAVAILABLE",
        authorized: error.code !== "PROVIDER_UNAUTHORIZED",
        rateLimited: error.code === "PROVIDER_RATE_LIMIT",
        lastCheckedAt: nowIso,
        lastError: { code: error.code, message: error.message },
      } as const;
      providerStatusCache.set(customerId, { expiresAt: Date.now() + providerStatusTtlMs, value: failing });
      return failing;
    }

    const unknown = {
      mode: token.mode,
      configured: true,
      reachable: false,
      authorized: false,
      rateLimited: false,
      lastCheckedAt: nowIso,
      lastError: { code: "PROVIDER_ERROR", message: "Provider probe failed." },
    } as const;
    providerStatusCache.set(customerId, { expiresAt: Date.now() + providerStatusTtlMs, value: unknown });
    return unknown;
  }
}

export async function getProviderStatusResponse(customerId: string) {
  const x = await getXProviderStatus(customerId);
  return {
    providers: {
      x,
      reddit: {
        mode: "coming_soon",
        configured: false,
        reachable: false,
        authorized: false,
        rateLimited: false,
        lastCheckedAt: null,
        lastError: null,
      },
    },
    provider: "x",
    hasBearerToken: x.configured,
    hasClientId: Boolean(config.xClientId),
    hasClientSecret: Boolean(config.xClientSecret),
    redirectUriConfigured: Boolean(config.xRedirectUri),
  };
}
