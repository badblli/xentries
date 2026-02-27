import { prisma } from "../db.js";

export type UsageMetricName = "api_calls" | "extraction_rows" | "events_delivered";

type UsageSnapshot = {
  apiCalls: number;
  extractionRows: number;
  eventsDelivered: number;
};

const metricToField: Record<UsageMetricName, keyof UsageSnapshot> = {
  api_calls: "apiCalls",
  extraction_rows: "extractionRows",
  events_delivered: "eventsDelivered",
};

export async function incrementUsageCounter(customerId: string, metric: UsageMetricName, delta = 1): Promise<void> {
  if (!Number.isFinite(delta) || delta <= 0) return;

  await prisma.usageCounter.upsert({
    where: {
      customerId_metric: {
        customerId,
        metric,
      },
    },
    create: {
      customerId,
      metric,
      value: Math.floor(delta),
    },
    update: {
      value: { increment: Math.floor(delta) },
    },
  });
}

export async function getUsageSnapshot(customerId: string): Promise<UsageSnapshot> {
  const counters = await prisma.usageCounter.findMany({ where: { customerId } });
  const usage: UsageSnapshot = {
    apiCalls: 0,
    extractionRows: 0,
    eventsDelivered: 0,
  };

  for (const row of counters) {
    usage[metricToField[row.metric as UsageMetricName]] = row.value;
  }

  return usage;
}
