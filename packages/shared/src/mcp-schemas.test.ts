import { describe, expect, it } from "vitest";
import { mcpToolNames, mcpToolSchemas } from "./mcp-schemas.js";

describe("mcp schemas", () => {
  it("exports tool names and input schemas", () => {
    expect(mcpToolNames.length).toBeGreaterThan(0);
    expect(mcpToolNames.includes("list_monitors")).toBe(true);
    expect(typeof mcpToolSchemas.create_monitor).toBe("object");
  });
});
