"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

export default function DocsPage() {
  const t = useTranslations("marketing.docs");
  const [sdk, setSdk] = useState<"node" | "python" | "curl">("node");
  const sdkCode = useMemo(
    () => ({
      node: `import { XentriesClient } from "@xentries/sdk";

const client = new XentriesClient({
  apiKey: process.env.XENTRIES_API_KEY
});

const events = await client.search.tweets({ query: "#ai" });
console.log(events.items[0]);`,
      python: `import requests

headers = {"x-api-key": "YOUR_XENTRIES_API_KEY"}
resp = requests.get(
    "http://localhost:8000/api/v1/x/search/tweets",
    params={"query": "#ai"},
    headers=headers,
    timeout=30
)
print(resp.json())`,
      curl: `curl -X GET "http://localhost:8000/api/v1/x/search/tweets?query=%23ai" \\
  -H "x-api-key: <XENTRIES_API_KEY>"`,
    }),
    [],
  );

  return (
    <div className="space-y-6">
      <Card className="soft-glow border-slate-700/70">
        <Badge className="border-cyan-300/50 bg-cyan-500/10 text-cyan-100">{t("badge")}</Badge>
        <h1 className="mt-3 text-3xl font-semibold sm:text-4xl">{t("title")}</h1>
        <p className="mt-2 max-w-2xl text-slate-400">{t("subtitle")}</p>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        {["search", "monitor", "deliver"].map((key) => (
          <Card key={key} className="border-slate-700/70">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{t(`blocks.${key}.label`)}</p>
            <h3 className="mt-2 text-lg font-semibold">{t(`blocks.${key}.title`)}</h3>
            <p className="mt-2 text-sm text-slate-400">{t(`blocks.${key}.desc`)}</p>
          </Card>
        ))}
      </div>

      <Card className="border-slate-700/70">
        <h2 className="text-xl font-semibold">{t("quickstart.title")}</h2>
        <ol className="mt-4 space-y-3 text-sm text-slate-300">
          {[1, 2, 3, 4].map((i) => (
            <li key={i} className="rounded-xl border border-slate-700/70 bg-slate-950/40 p-3">
              <span className="font-semibold text-cyan-200">{i}. </span>
              {t(`quickstart.s${i}`)}
            </li>
          ))}
        </ol>
      </Card>

      <Card className="border-slate-700/70 p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 p-4">
          <h3 className="font-semibold">{t("snippets.sdk.title")}</h3>
          <div className="inline-flex rounded-lg border border-slate-700 bg-slate-950/50 p-1 text-xs">
            {(["node", "python", "curl"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setSdk(tab)}
                className={`focus-ring rounded-md px-3 py-1.5 ${sdk === tab ? "bg-slate-100 text-slate-900" : "text-slate-300"}`}
              >
                {t(`snippets.sdk.tabs.${tab}`)}
              </button>
            ))}
          </div>
        </div>
        <pre className="overflow-x-auto bg-slate-950/60 p-4 text-xs text-slate-200">{sdkCode[sdk]}</pre>
      </Card>

      <Card className="border-slate-700/70 p-0">
        <div className="border-b border-slate-800 p-4">
          <h3 className="font-semibold">{t("snippets.monitor.title")}</h3>
        </div>
        <pre className="overflow-x-auto bg-slate-950/60 p-4 text-xs text-slate-200">{`curl -X POST "http://localhost:8000/api/v1/monitors" \\
  -H "content-type: application/json" \\
  -H "x-api-key: <XENTRIES_API_KEY>" \\
  -d '{
    "provider":"x",
    "kind":"query",
    "target":{"query":"openai"},
    "pollingIntervalSec":60,
    "eventTypes":["tweet.new"],
    "isActive":true
  }'`}</pre>
      </Card>

      <Card className="border-slate-700/70 p-0">
        <div className="border-b border-slate-800 p-4">
          <h3 className="font-semibold">{t("snippets.ws.title")}</h3>
        </div>
        <pre className="overflow-x-auto bg-slate-950/60 p-4 text-xs text-slate-200">{`const ws = new WebSocket("ws://localhost:8000/ws", {
  headers: { "x-api-key": "<XENTRIES_API_KEY>" }
});

ws.onopen = () => {
  ws.send(JSON.stringify({ action: "subscribe", monitorId: "mon_123" }));
};

ws.onmessage = (event) => {
  console.log(JSON.parse(event.data));
};`}</pre>
      </Card>

      <Card className="border-slate-700/70 p-0">
        <div className="border-b border-slate-800 p-4">
          <h3 className="font-semibold">{t("snippets.webhook.title")}</h3>
        </div>
        <pre className="overflow-x-auto bg-slate-950/60 p-4 text-xs text-slate-200">{`import crypto from "node:crypto";

function verify(rawBody, signature, secret) {
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  return expected === signature;
}`}</pre>
      </Card>

      <Card className="border-slate-700/70 p-0">
        <div className="border-b border-slate-800 p-4">
          <h3 className="font-semibold">5) MCP tools list</h3>
        </div>
        <pre className="overflow-x-auto bg-slate-950/60 p-4 text-xs text-slate-200">{`curl -X POST "http://localhost:8000/mcp" \\
  -H "content-type: application/json" \\
  -H "x-api-key: <XENTRIES_API_KEY>" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'`}</pre>
      </Card>
    </div>
  );
}
