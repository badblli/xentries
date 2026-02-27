import { describe, expect, it } from "vitest";
import { getMcpToolList, handleMcpRpc } from "../src/mcp/server.js";

describe("mcp server", () => {
  it("returns tool list with schemas", () => {
    const tools = getMcpToolList();
    expect(tools.length).toBeGreaterThan(0);
    expect(tools.some((tool) => tool.name === "list_monitors")).toBe(true);
    expect(tools.every((tool) => typeof tool.inputSchema === "object")).toBe(true);
  });

  it("handles initialize", async () => {
    const response = await handleMcpRpc("c_test", {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {},
    });

    expect((response as { result?: { serverInfo?: { name?: string } } }).result?.serverInfo?.name).toBe("xentries-mcp");
  });
});
