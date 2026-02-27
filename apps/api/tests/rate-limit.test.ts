import { describe, expect, it } from "vitest";
import { enforceApiKeyRateLimit } from "../src/middleware/rate-limit.js";

function mockReply() {
  const state: { statusCode?: number; payload?: unknown; headers: Record<string, string> } = { headers: {} };
  return {
    state,
    header(name: string, value: string) {
      state.headers[name] = value;
      return this;
    },
    code(statusCode: number) {
      state.statusCode = statusCode;
      return this;
    },
    send(payload: unknown) {
      state.payload = payload;
      return this;
    },
  };
}

describe("api key rate limit", () => {
  it("allows burst of 20 then blocks", () => {
    const request = { headers: { "x-api-key": "xe_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" } } as never;

    for (let i = 0; i < 20; i += 1) {
      const reply = mockReply();
      expect(enforceApiKeyRateLimit(request, reply as never)).toBe(true);
    }

    const blockedReply = mockReply();
    expect(enforceApiKeyRateLimit(request, blockedReply as never)).toBe(false);
    expect(blockedReply.state.statusCode).toBe(429);
  });
});
