-- Dropship Social V1 initial schema (Prisma 7 compatible PostgreSQL migration)
CREATE TYPE "WorkspaceRole" AS ENUM ('OWNER','ADMIN','EDITOR','OPERATOR','VIEWER');
CREATE TYPE "Platform" AS ENUM ('FACEBOOK','INSTAGRAM','THREADS','TIKTOK');
CREATE TYPE "PublishMode" AS ENUM ('API','BROWSER','HYBRID');
CREATE TYPE "ContentType" AS ENUM ('VIDEO','IMAGE','TEXT');
CREATE TYPE "AccountStatus" AS ENUM ('CONNECTED','EXPIRED','DISCONNECTED','ERROR');
CREATE TYPE "JobStatus" AS ENUM ('QUEUED','PROCESSING','RETRYING','PUBLISHED','FAILED','CANCELLED');

CREATE TABLE "User" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Workspace" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "WorkspaceMember" (
  "workspaceId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" "WorkspaceRole" NOT NULL,
  CONSTRAINT "WorkspaceMember_pkey" PRIMARY KEY ("workspaceId","userId")
);
CREATE TABLE "Brand" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "language" TEXT NOT NULL,
  "timezone" TEXT NOT NULL,
  "currency" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  CONSTRAINT "Brand_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Product" (
  "id" TEXT NOT NULL,
  "brandId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "description" TEXT,
  "imageAssetId" TEXT,
  "supplierUrl" TEXT,
  "landingUrl" TEXT,
  "cost" DECIMAL(18,4),
  "sellingPrice" DECIMAL(18,4),
  "currency" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "SocialAccount" (
  "id" TEXT NOT NULL,
  "brandId" TEXT NOT NULL,
  "platform" "Platform" NOT NULL,
  "username" TEXT,
  "displayName" TEXT,
  "platformAccountId" TEXT,
  "publishMode" "PublishMode" NOT NULL,
  "status" "AccountStatus" NOT NULL,
  CONSTRAINT "SocialAccount_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "SocialCredential" (
  "id" TEXT NOT NULL,
  "socialAccountId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "encryptedAccessToken" TEXT NOT NULL,
  "encryptedRefreshToken" TEXT,
  "iv" TEXT NOT NULL,
  "authTag" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3),
  "scopes" JSONB,
  CONSTRAINT "SocialCredential_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "BrowserNode" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "host" TEXT NOT NULL,
  "port" INTEGER NOT NULL,
  "status" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "lastSeenAt" TIMESTAMP(3),
  "maxConcurrency" INTEGER NOT NULL DEFAULT 2,
  "encryptedNodeKey" TEXT,
  CONSTRAINT "BrowserNode_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "BrowserProfile" (
  "id" TEXT NOT NULL,
  "brandId" TEXT NOT NULL,
  "browserNodeId" TEXT NOT NULL,
  "socialAccountId" TEXT,
  "provider" TEXT NOT NULL,
  "providerProfileId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "metadata" JSONB,
  CONSTRAINT "BrowserProfile_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "MediaAsset" (
  "id" TEXT NOT NULL,
  "brandId" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "storageProvider" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" BIGINT,
  "width" INTEGER,
  "height" INTEGER,
  "durationMs" INTEGER,
  CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ContentItem" (
  "id" TEXT NOT NULL,
  "brandId" TEXT NOT NULL,
  "productId" TEXT,
  "type" "ContentType" NOT NULL,
  "title" TEXT NOT NULL,
  "hook" TEXT,
  "body" TEXT,
  "cta" TEXT,
  "masterAssetId" TEXT,
  "status" TEXT NOT NULL,
  CONSTRAINT "ContentItem_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ContentVariant" (
  "id" TEXT NOT NULL,
  "contentItemId" TEXT NOT NULL,
  "socialAccountId" TEXT,
  "platform" "Platform" NOT NULL,
  "caption" TEXT,
  "body" TEXT,
  "hashtags" JSONB,
  "cta" TEXT,
  "assetId" TEXT,
  "status" TEXT NOT NULL,
  CONSTRAINT "ContentVariant_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Campaign" (
  "id" TEXT NOT NULL,
  "brandId" TEXT NOT NULL,
  "productId" TEXT,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "startAt" TIMESTAMP(3),
  "endAt" TIMESTAMP(3),
  "status" TEXT NOT NULL,
  CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "CampaignContent" (
  "campaignId" TEXT NOT NULL,
  "contentItemId" TEXT NOT NULL,
  CONSTRAINT "CampaignContent_pkey" PRIMARY KEY ("campaignId","contentItemId")
);
CREATE TABLE "PublishBatch" (
  "id" TEXT NOT NULL,
  "brandId" TEXT NOT NULL,
  "contentItemId" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PublishBatch_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PublishJob" (
  "id" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "brandId" TEXT NOT NULL,
  "socialAccountId" TEXT NOT NULL,
  "contentVariantId" TEXT NOT NULL,
  "platform" "Platform" NOT NULL,
  "strategy" TEXT NOT NULL,
  "scheduledAt" TIMESTAMP(3) NOT NULL,
  "status" "JobStatus" NOT NULL,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 4,
  "idempotencyKey" TEXT NOT NULL,
  "remoteCorrelationId" TEXT,
  "errorCode" TEXT,
  "errorMessage" TEXT,
  CONSTRAINT "PublishJob_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PublishAttempt" (
  "id" TEXT NOT NULL,
  "publishJobId" TEXT NOT NULL,
  "attemptNumber" INTEGER NOT NULL,
  "strategy" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL,
  "finishedAt" TIMESTAMP(3),
  "status" TEXT NOT NULL,
  "errorType" TEXT,
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "metadata" JSONB,
  CONSTRAINT "PublishAttempt_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PublishedPost" (
  "id" TEXT NOT NULL,
  "brandId" TEXT NOT NULL,
  "publishJobId" TEXT NOT NULL,
  "socialAccountId" TEXT NOT NULL,
  "contentVariantId" TEXT NOT NULL,
  "platform" "Platform" NOT NULL,
  "platformPostId" TEXT NOT NULL,
  "platformPostUrl" TEXT,
  "publishedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PublishedPost_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PostMetric" (
  "id" TEXT NOT NULL,
  "publishedPostId" TEXT NOT NULL,
  "capturedAt" TIMESTAMP(3) NOT NULL,
  "captureKey" TEXT NOT NULL,
  "views" BIGINT,
  "likes" BIGINT,
  "comments" BIGINT,
  "shares" BIGINT,
  "saves" BIGINT,
  "clicks" BIGINT,
  "rawMetrics" JSONB,
  CONSTRAINT "PostMetric_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "TrackedLink" (
  "id" TEXT NOT NULL,
  "brandId" TEXT NOT NULL,
  "productId" TEXT,
  "contentItemId" TEXT,
  "publishedPostId" TEXT,
  "code" TEXT NOT NULL,
  "targetUrl" TEXT NOT NULL,
  "utmSource" TEXT,
  "utmMedium" TEXT,
  "utmCampaign" TEXT,
  "utmContent" TEXT,
  CONSTRAINT "TrackedLink_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ClickEvent" (
  "id" TEXT NOT NULL,
  "trackedLinkId" TEXT NOT NULL,
  "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "referrer" TEXT,
  "userAgent" TEXT,
  "country" TEXT,
  "deviceType" TEXT,
  CONSTRAINT "ClickEvent_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "AuthSession" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "refreshTokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "AuditLog" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "userId" TEXT,
  "action" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "Brand_workspaceId_slug_key" ON "Brand"("workspaceId","slug");
CREATE UNIQUE INDEX "Product_brandId_slug_key" ON "Product"("brandId","slug");
CREATE UNIQUE INDEX "SocialCredential_socialAccountId_key" ON "SocialCredential"("socialAccountId");
CREATE UNIQUE INDEX "BrowserProfile_socialAccountId_key" ON "BrowserProfile"("socialAccountId");
CREATE UNIQUE INDEX "BrowserProfile_browserNodeId_providerProfileId_key" ON "BrowserProfile"("browserNodeId","providerProfileId");
CREATE UNIQUE INDEX "MediaAsset_storageProvider_storageKey_key" ON "MediaAsset"("storageProvider","storageKey");
CREATE UNIQUE INDEX "PublishJob_idempotencyKey_key" ON "PublishJob"("idempotencyKey");
CREATE UNIQUE INDEX "PublishAttempt_publishJobId_attemptNumber_key" ON "PublishAttempt"("publishJobId","attemptNumber");
CREATE UNIQUE INDEX "PublishedPost_publishJobId_key" ON "PublishedPost"("publishJobId");
CREATE UNIQUE INDEX "PostMetric_publishedPostId_captureKey_key" ON "PostMetric"("publishedPostId","captureKey");
CREATE UNIQUE INDEX "TrackedLink_code_key" ON "TrackedLink"("code");

CREATE INDEX "Brand_workspaceId_idx" ON "Brand"("workspaceId");
CREATE INDEX "Product_brandId_status_idx" ON "Product"("brandId","status");
CREATE INDEX "SocialAccount_brandId_platform_idx" ON "SocialAccount"("brandId","platform");
CREATE INDEX "BrowserNode_workspaceId_status_idx" ON "BrowserNode"("workspaceId","status");
CREATE INDEX "BrowserProfile_brandId_idx" ON "BrowserProfile"("brandId");
CREATE INDEX "MediaAsset_brandId_idx" ON "MediaAsset"("brandId");
CREATE INDEX "ContentItem_brandId_status_idx" ON "ContentItem"("brandId","status");
CREATE INDEX "ContentItem_productId_idx" ON "ContentItem"("productId");
CREATE INDEX "ContentVariant_contentItemId_platform_idx" ON "ContentVariant"("contentItemId","platform");
CREATE INDEX "ContentVariant_socialAccountId_idx" ON "ContentVariant"("socialAccountId");
CREATE INDEX "Campaign_brandId_status_idx" ON "Campaign"("brandId","status");
CREATE INDEX "PublishBatch_brandId_createdAt_idx" ON "PublishBatch"("brandId","createdAt");
CREATE INDEX "PublishJob_status_scheduledAt_idx" ON "PublishJob"("status","scheduledAt");
CREATE INDEX "PublishJob_brandId_scheduledAt_idx" ON "PublishJob"("brandId","scheduledAt");
CREATE INDEX "PublishJob_socialAccountId_idx" ON "PublishJob"("socialAccountId");
CREATE INDEX "PublishedPost_brandId_publishedAt_idx" ON "PublishedPost"("brandId","publishedAt");
CREATE INDEX "PublishedPost_socialAccountId_idx" ON "PublishedPost"("socialAccountId");
CREATE INDEX "PostMetric_publishedPostId_capturedAt_idx" ON "PostMetric"("publishedPostId","capturedAt");
CREATE INDEX "TrackedLink_brandId_idx" ON "TrackedLink"("brandId");
CREATE INDEX "ClickEvent_trackedLinkId_timestamp_idx" ON "ClickEvent"("trackedLinkId","timestamp");
CREATE INDEX "AuthSession_userId_expiresAt_idx" ON "AuthSession"("userId","expiresAt");
CREATE INDEX "AuditLog_workspaceId_createdAt_idx" ON "AuditLog"("workspaceId","createdAt");

ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Brand" ADD CONSTRAINT "Brand_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Product" ADD CONSTRAINT "Product_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SocialAccount" ADD CONSTRAINT "SocialAccount_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SocialCredential" ADD CONSTRAINT "SocialCredential_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "SocialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BrowserNode" ADD CONSTRAINT "BrowserNode_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BrowserProfile" ADD CONSTRAINT "BrowserProfile_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BrowserProfile" ADD CONSTRAINT "BrowserProfile_browserNodeId_fkey" FOREIGN KEY ("browserNodeId") REFERENCES "BrowserNode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BrowserProfile" ADD CONSTRAINT "BrowserProfile_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "SocialAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ContentItem" ADD CONSTRAINT "ContentItem_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ContentItem" ADD CONSTRAINT "ContentItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ContentVariant" ADD CONSTRAINT "ContentVariant_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "ContentItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContentVariant" ADD CONSTRAINT "ContentVariant_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "SocialAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CampaignContent" ADD CONSTRAINT "CampaignContent_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CampaignContent" ADD CONSTRAINT "CampaignContent_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "ContentItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PublishBatch" ADD CONSTRAINT "PublishBatch_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PublishBatch" ADD CONSTRAINT "PublishBatch_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "ContentItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PublishJob" ADD CONSTRAINT "PublishJob_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "PublishBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PublishJob" ADD CONSTRAINT "PublishJob_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "SocialAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PublishJob" ADD CONSTRAINT "PublishJob_contentVariantId_fkey" FOREIGN KEY ("contentVariantId") REFERENCES "ContentVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PublishAttempt" ADD CONSTRAINT "PublishAttempt_publishJobId_fkey" FOREIGN KEY ("publishJobId") REFERENCES "PublishJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PublishedPost" ADD CONSTRAINT "PublishedPost_publishJobId_fkey" FOREIGN KEY ("publishJobId") REFERENCES "PublishJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PublishedPost" ADD CONSTRAINT "PublishedPost_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "SocialAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PublishedPost" ADD CONSTRAINT "PublishedPost_contentVariantId_fkey" FOREIGN KEY ("contentVariantId") REFERENCES "ContentVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PostMetric" ADD CONSTRAINT "PostMetric_publishedPostId_fkey" FOREIGN KEY ("publishedPostId") REFERENCES "PublishedPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrackedLink" ADD CONSTRAINT "TrackedLink_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TrackedLink" ADD CONSTRAINT "TrackedLink_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TrackedLink" ADD CONSTRAINT "TrackedLink_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "ContentItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TrackedLink" ADD CONSTRAINT "TrackedLink_publishedPostId_fkey" FOREIGN KEY ("publishedPostId") REFERENCES "PublishedPost"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ClickEvent" ADD CONSTRAINT "ClickEvent_trackedLinkId_fkey" FOREIGN KEY ("trackedLinkId") REFERENCES "TrackedLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
