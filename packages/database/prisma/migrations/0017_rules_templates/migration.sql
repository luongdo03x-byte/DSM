CREATE TABLE "ReplyTemplate" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "brandId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  CONSTRAINT "ReplyTemplate_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ReplyTemplate_brandId_idx" ON "ReplyTemplate"("brandId");

CREATE TABLE "AutomationRule" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "brandId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT FALSE,
  "platforms" JSONB NOT NULL,
  "match" JSONB NOT NULL,
  "actions" JSONB NOT NULL,
  "maxPerHour" INTEGER NOT NULL DEFAULT 30,
  CONSTRAINT "AutomationRule_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "AutomationRule_brandId_enabled_idx" ON "AutomationRule"("brandId", "enabled");
