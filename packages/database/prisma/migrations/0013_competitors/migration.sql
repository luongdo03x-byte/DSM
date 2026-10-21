CREATE TABLE "Competitor" (
  "id" TEXT NOT NULL,
  "brandId" TEXT NOT NULL,
  "platform" "Platform" NOT NULL,
  "handle" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  CONSTRAINT "Competitor_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Competitor_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Competitor_brandId_platform_handle_key" ON "Competitor"("brandId", "platform", "handle");

CREATE TABLE "CompetitorSnapshot" (
  "id" TEXT NOT NULL,
  "competitorId" TEXT NOT NULL,
  "day" TEXT NOT NULL,
  "followers" BIGINT,
  "posts" BIGINT,
  "source" TEXT NOT NULL,
  "capturedAt" BIGINT NOT NULL,
  "raw" JSONB,
  CONSTRAINT "CompetitorSnapshot_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CompetitorSnapshot_competitorId_fkey" FOREIGN KEY ("competitorId") REFERENCES "Competitor"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CompetitorSnapshot_competitorId_day_key" ON "CompetitorSnapshot"("competitorId", "day");
