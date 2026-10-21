CREATE TABLE "QuotaUsage" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "provider" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "day" TEXT NOT NULL,
  "used" INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX "QuotaUsage_provider_scope_day_key" ON "QuotaUsage"("provider", "scope", "day");
