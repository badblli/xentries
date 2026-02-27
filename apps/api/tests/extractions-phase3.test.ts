import { describe, expect, it } from "vitest";
import { enforceExportLimit, exportMarkdown, extractionRows } from "../src/services/extraction-export-service.js";

describe("phase3 extraction helpers", () => {
  it("paginates extraction rows", () => {
    const page = extractionRows([{ a: 1 }, { a: 2 }, { a: 3 }], 1, 2);
    expect(page.total).toBe(3);
    expect(page.items).toHaveLength(2);
  });

  it("enforces row limit", () => {
    const rows = Array.from({ length: 50001 }, (_, i) => ({ i }));
    const check = enforceExportLimit(rows);
    expect(check.ok).toBe(false);
  });

  it("exports markdown", () => {
    const md = exportMarkdown([{ a: 1, b: "x" }]);
    expect(md.includes("| a | b |")).toBe(true);
  });
});
