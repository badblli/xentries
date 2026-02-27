import { describe, expect, it } from "vitest";
import { createExtractionRequestSchema, createMonitorSchema, gatewayEventSchema, legacyCreateMonitorSchema } from "../src/contracts.js";

describe("gatewayEventSchema", () => {
  it("validates standard payload", () => {
    const parsed = gatewayEventSchema.parse({
      eventVersion: 1,
      type: "tweet.new",
      provider: "x",
      providerItemId: "123",
      monitorId: "m1",
      customerId: "c1",
      occurredAt: new Date().toISOString(),
      payload: {
        tweetId: "123",
        text: "hi",
        authorId: "1",
        authorUsername: "u",
        createdAt: new Date().toISOString(),
        url: "https://x.com/u/status/123",
        metrics: { likeCount: 1, retweetCount: 1, replyCount: 0 },
      },
    });
    expect(parsed.provider).toBe("x");
  });
});

describe("monitor schemas", () => {
  it("accepts canonical query monitor", () => {
    const parsed = createMonitorSchema.parse({
      kind: "query",
      target: { query: "from:openai" },
      pollingIntervalSec: 60,
      eventTypes: ["tweet.new"],
    });
    expect(parsed.kind).toBe("query");
  });

  it("accepts legacy monitor payload", () => {
    const parsed = legacyCreateMonitorSchema.parse({
      type: "keyword",
      query: "from:openai",
      pollingIntervalSec: 60,
      eventTypes: ["tweet.new"],
    });
    expect(parsed.type).toBe("keyword");
  });
});

describe("extraction schemas", () => {
  it("accepts canonical extraction request", () => {
    const parsed = createExtractionRequestSchema.parse({
      tool: "x.search_results",
      params: { query: "from:openai" },
    });
    expect(parsed.tool).toBe("x.search_results");
  });
});
