export type MonitorForGrouping = {
  id: string;
  provider: "x" | "reddit";
  kind?: "account" | "query" | "tweet";
  type?: "keyword" | "user" | "mentions";
  query?: string;
  target?: Record<string, string> | null;
};

export function buildMonitorFanoutKey(monitor: MonitorForGrouping): string {
  if (monitor.kind === "query" && monitor.target?.query) {
    return `x:query:${monitor.target.query}`;
  }

  if (monitor.kind === "account") {
    if (monitor.target?.userId) return `x:account:user:${monitor.target.userId}`;
    if (monitor.target?.username) return `x:account:username:${monitor.target.username}`;
  }

  if (monitor.kind === "tweet" && monitor.target?.tweetId) {
    return `x:tweet:${monitor.target.tweetId}`;
  }

  return `${monitor.provider}:${monitor.type ?? "keyword"}:${monitor.query ?? ""}`;
}

export function groupMonitorsForFanout(monitors: MonitorForGrouping[]) {
  const groups = new Map<string, MonitorForGrouping[]>();
  for (const monitor of monitors) {
    const key = buildMonitorFanoutKey(monitor);
    const list = groups.get(key);
    if (list) {
      list.push(monitor);
      continue;
    }
    groups.set(key, [monitor]);
  }
  return groups;
}
