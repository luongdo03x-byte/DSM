CREATE TABLE "BrandVoice" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "brandId" TEXT NOT NULL UNIQUE,
  "version" INTEGER NOT NULL,
  "tone" TEXT NOT NULL,
  "doList" JSONB NOT NULL,
  "dontList" JSONB NOT NULL,
  "samplePosts" JSONB NOT NULL,
  CONSTRAINT "BrandVoice_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "AiUsage" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "workspaceId" TEXT NOT NULL,
  "task" TEXT NOT NULL,
  "inputTokens" INTEGER NOT NULL,
  "outputTokens" INTEGER NOT NULL,
  "cacheReadTokens" INTEGER NOT NULL,
  "createdAt" BIGINT NOT NULL,
  CONSTRAINT "AiUsage_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "AiUsage_workspaceId_createdAt_idx" ON "AiUsage"("workspaceId", "createdAt");
