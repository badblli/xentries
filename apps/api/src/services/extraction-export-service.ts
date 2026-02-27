import { stringify } from "csv-stringify/sync";
import * as XLSX from "xlsx";

export const EXTRACTION_EXPORT_LIMIT = 50_000;

function ensureRows(input: unknown): Record<string, unknown>[] {
  if (!Array.isArray(input)) return [];
  return input.filter((item) => item && typeof item === "object") as Record<string, unknown>[];
}

export function extractionRows(input: unknown, offset: number, limit: number) {
  const rows = ensureRows(input);
  const page = rows.slice(offset, offset + limit);
  return {
    total: rows.length,
    items: page,
  };
}

export function exportJson(input: unknown): string {
  return JSON.stringify(ensureRows(input), null, 2);
}

export function exportCsv(input: unknown): string {
  return stringify(ensureRows(input), { header: true });
}

export function exportMarkdown(input: unknown): string {
  const rows = ensureRows(input);
  if (rows.length === 0) return "| empty |\n| --- |\n| no data |\n";
  const keys = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const header = `| ${keys.join(" | ")} |`;
  const sep = `| ${keys.map(() => "---").join(" | ")} |`;
  const body = rows
    .map((row) => `| ${keys.map((k) => String(row[k] ?? "").replace(/\|/g, "\\|")).join(" | ")} |`)
    .join("\n");
  return `${header}\n${sep}\n${body}\n`;
}

export function exportXlsx(input: unknown): Buffer {
  const rows = ensureRows(input);
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, "data");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

export function enforceExportLimit(input: unknown) {
  const rows = ensureRows(input);
  if (rows.length > EXTRACTION_EXPORT_LIMIT) {
    return {
      ok: false,
      total: rows.length,
      limit: EXTRACTION_EXPORT_LIMIT,
    };
  }
  return {
    ok: true,
    total: rows.length,
    limit: EXTRACTION_EXPORT_LIMIT,
  };
}
