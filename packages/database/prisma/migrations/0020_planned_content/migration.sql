ALTER TABLE "ContentItem" ADD COLUMN "plannedAt" BIGINT;
ALTER TABLE "ContentItem" ADD COLUMN "plannedSocialAccountId" TEXT;
ALTER TABLE "ContentItem" ADD COLUMN "plannedEventName" TEXT;
CREATE INDEX "ContentItem_brandId_plannedAt_idx" ON "ContentItem"("brandId", "plannedAt");
