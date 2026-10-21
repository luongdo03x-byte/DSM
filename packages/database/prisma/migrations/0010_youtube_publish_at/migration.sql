ALTER TABLE "PublishJob" ADD COLUMN "publishAt" BIGINT;
CREATE INDEX "PublishJob_brandId_publishAt_idx" ON "PublishJob"("brandId", "publishAt");
