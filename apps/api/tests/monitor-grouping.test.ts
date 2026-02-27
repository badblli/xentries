import { describe, expect, it } from "vitest";
import { groupMonitorsForFanout } from "../src/internal/monitor-grouping.js";

describe("monitor grouping", () => {
  it("groups monitors by canonical target", () => {
    const groups = groupMonitorsForFanout([
      { id: "m1", provider: "x", kind: "query", target: { query: "from:openai" } },
      { id: "m2", provider: "x", kind: "query", target: { query: "from:openai" } },
      { id: "m3", provider: "x", kind: "query", target: { query: "openai" } },
    ]);

    expect(groups.size).toBe(2);
    expect(Array.from(groups.values()).some((rows) => rows.length === 2)).toBe(true);
  });
});
