"use client";

import { useTranslations } from "next-intl";
import { Card } from "@/components/ui/card";

const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export default function McpPage() {
  const t = useTranslations("app.mcp");

  return (
    <div className="space-y-4">
      <Card>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="mt-2 text-sm text-slate-400">{t("subtitle")}</p>
      </Card>

      <Card className="space-y-3">
        <p className="text-sm text-slate-300">{t("officialOnly")}</p>
        <p className="text-sm text-slate-400">{t("publicMode")}</p>
      </Card>

      <Card className="space-y-2 p-0">
        <div className="border-b border-slate-800 p-4">
          <h2 className="font-semibold">{t("cursor.title")}</h2>
        </div>
        <pre className="overflow-x-auto bg-slate-950/60 p-4 text-xs text-slate-200">{`{
  "name": "xentries-mcp",
  "transport": "streamable-http",
  "url": "${baseUrl}/mcp",
  "headers": {
    "x-api-key": "<YOUR_XENTRIES_API_KEY>"
  }
}`}</pre>
      </Card>

      <Card className="space-y-2 p-0">
        <div className="border-b border-slate-800 p-4">
          <h2 className="font-semibold">{t("claude.title")}</h2>
        </div>
        <pre className="overflow-x-auto bg-slate-950/60 p-4 text-xs text-slate-200">{`{
  "mcpServers": {
    "xentries": {
      "type": "streamable-http",
      "url": "${baseUrl}/mcp",
      "headers": {
        "x-api-key": "<YOUR_XENTRIES_API_KEY>"
      }
    }
  }
}`}</pre>
      </Card>

      <Card className="space-y-2 p-0">
        <div className="border-b border-slate-800 p-4">
          <h2 className="font-semibold">{t("smoke.title")}</h2>
        </div>
        <pre className="overflow-x-auto bg-slate-950/60 p-4 text-xs text-slate-200">{`curl -X POST "${baseUrl}/mcp" \\
  -H "content-type: application/json" \\
  -H "x-api-key: <YOUR_XENTRIES_API_KEY>" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'`}</pre>
      </Card>
    </div>
  );
}
