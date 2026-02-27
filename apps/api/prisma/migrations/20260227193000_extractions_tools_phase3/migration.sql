ALTER TABLE "ExtractionJob"
ADD COLUMN "tool" TEXT NOT NULL DEFAULT 'x.search_results';

UPDATE "ExtractionJob"
SET "tool" = CASE
  WHEN "kind" = 'search_results'::"ExtractionKind" THEN 'x.search_results'
  WHEN "kind" = 'user_tweets'::"ExtractionKind" THEN 'x.user_posts'
  ELSE 'x.search_results'
END;

CREATE INDEX "ExtractionJob_customerId_tool_createdAt_idx" ON "ExtractionJob"("customerId", "tool", "createdAt");
