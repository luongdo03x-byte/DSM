CREATE TABLE "NotificationChannel" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "target" TEXT NOT NULL,
  "encryptedSecret" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "NotificationChannel_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "NotificationChannel_workspaceId_enabled_idx" ON "NotificationChannel"("workspaceId", "enabled");
ALTER TABLE "NotificationChannel" ADD CONSTRAINT "NotificationChannel_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
