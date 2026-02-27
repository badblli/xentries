-- Phase 4: trends/rate limits/usage counters
CREATE TYPE "UsageMetric" AS ENUM ('api_calls', 'extraction_rows', 'events_delivered');

CREATE TABLE "UsageCounter" (
  "id" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "metric" "UsageMetric" NOT NULL,
  "value" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UsageCounter_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UsageCounter_customerId_metric_key" ON "UsageCounter"("customerId", "metric");
CREATE INDEX "UsageCounter_customerId_idx" ON "UsageCounter"("customerId");

ALTER TABLE "UsageCounter"
ADD CONSTRAINT "UsageCounter_customerId_fkey"
FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
