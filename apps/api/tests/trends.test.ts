import { describe, expect, it } from "vitest";
import { getTrendsResponse } from "../src/services/trends-service.js";

describe("trends service", () => {
  it("returns safe not_supported stub", async () => {
    const response = await getTrendsResponse("TR");
    expect(response.region).toBe("TR");
    expect(response.status).toBe("not_supported");
    expect(response.usageCost).toBe(0);
    expect(response.items).toEqual([]);
    expect(response.supportedRegions.includes("TR")).toBe(true);
  });

  it("uses cache on repeated calls", async () => {
    const first = await getTrendsResponse("US");
    const second = await getTrendsResponse("US");
    expect(first.region).toBe("US");
    expect(second.cached).toBe(true);
  });
});
