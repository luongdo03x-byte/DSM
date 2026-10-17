-- Preserve existing timestamp values as epoch milliseconds for the numeric domain model.
BEGIN;

ALTER TABLE "SocialCredential" ALTER COLUMN "expiresAt" TYPE BIGINT USING (EXTRACT(EPOCH FROM "expiresAt") * 1000)::bigint;
ALTER TABLE "BrowserNode" ALTER COLUMN "lastSeenAt" TYPE BIGINT USING (EXTRACT(EPOCH FROM "lastSeenAt") * 1000)::bigint;

ALTER TABLE "PublishBatch" ALTER COLUMN "createdAt" DROP DEFAULT;
ALTER TABLE "PublishBatch" ALTER COLUMN "createdAt" TYPE BIGINT USING (EXTRACT(EPOCH FROM "createdAt") * 1000)::bigint;
ALTER TABLE "PublishBatch" ALTER COLUMN "createdAt" SET DEFAULT ((EXTRACT(EPOCH FROM CURRENT_TIMESTAMP) * 1000)::bigint);

ALTER TABLE "PublishJob" ALTER COLUMN "scheduledAt" TYPE BIGINT USING (EXTRACT(EPOCH FROM "scheduledAt") * 1000)::bigint;
ALTER TABLE "PublishAttempt" ALTER COLUMN "startedAt" TYPE BIGINT USING (EXTRACT(EPOCH FROM "startedAt") * 1000)::bigint;
ALTER TABLE "PublishAttempt" ALTER COLUMN "finishedAt" TYPE BIGINT USING (EXTRACT(EPOCH FROM "finishedAt") * 1000)::bigint;
ALTER TABLE "PublishedPost" ALTER COLUMN "publishedAt" TYPE BIGINT USING (EXTRACT(EPOCH FROM "publishedAt") * 1000)::bigint;
ALTER TABLE "PostMetric" ALTER COLUMN "capturedAt" TYPE BIGINT USING (EXTRACT(EPOCH FROM "capturedAt") * 1000)::bigint;

ALTER TABLE "ClickEvent" ALTER COLUMN "timestamp" DROP DEFAULT;
ALTER TABLE "ClickEvent" ALTER COLUMN "timestamp" TYPE BIGINT USING (EXTRACT(EPOCH FROM "timestamp") * 1000)::bigint;
ALTER TABLE "ClickEvent" ALTER COLUMN "timestamp" SET DEFAULT ((EXTRACT(EPOCH FROM CURRENT_TIMESTAMP) * 1000)::bigint);

ALTER TABLE "AuthSession" ALTER COLUMN "expiresAt" TYPE BIGINT USING (EXTRACT(EPOCH FROM "expiresAt") * 1000)::bigint;
ALTER TABLE "AuthSession" ALTER COLUMN "revokedAt" TYPE BIGINT USING (EXTRACT(EPOCH FROM "revokedAt") * 1000)::bigint;
ALTER TABLE "AuthSession" ALTER COLUMN "createdAt" DROP DEFAULT;
ALTER TABLE "AuthSession" ALTER COLUMN "createdAt" TYPE BIGINT USING (EXTRACT(EPOCH FROM "createdAt") * 1000)::bigint;
ALTER TABLE "AuthSession" ALTER COLUMN "createdAt" SET DEFAULT ((EXTRACT(EPOCH FROM CURRENT_TIMESTAMP) * 1000)::bigint);

ALTER TABLE "AuditLog" ALTER COLUMN "createdAt" DROP DEFAULT;
ALTER TABLE "AuditLog" ALTER COLUMN "createdAt" TYPE BIGINT USING (EXTRACT(EPOCH FROM "createdAt") * 1000)::bigint;
ALTER TABLE "AuditLog" ALTER COLUMN "createdAt" SET DEFAULT ((EXTRACT(EPOCH FROM CURRENT_TIMESTAMP) * 1000)::bigint);

CREATE TABLE "BrowserRegistration" (
  "id" TEXT NOT NULL,
  "nodeId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" BIGINT NOT NULL,
  "consumedAt" BIGINT,
  CONSTRAINT "BrowserRegistration_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "BrowserRegistration_nodeId_key" ON "BrowserRegistration"("nodeId");
ALTER TABLE "BrowserRegistration" ADD CONSTRAINT "BrowserRegistration_nodeId_fkey"
  FOREIGN KEY ("nodeId") REFERENCES "BrowserNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PublishJob" ADD COLUMN "processingStartedAt" BIGINT;

COMMIT;
