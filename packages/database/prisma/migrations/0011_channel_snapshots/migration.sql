CREATE TABLE "ChannelSnapshot" (
  "id" TEXT NOT NULL,
  "socialAccountId" TEXT NOT NULL,
  "day" TEXT NOT NULL,
  "followers" BIGINT,
  "views" BIGINT,
  "reach" BIGINT,
  "engagements" BIGINT,
  "profileViews" BIGINT,
  "watchTimeMinutes" BIGINT,
  "source" TEXT NOT NULL,
  "capturedAt" BIGINT NOT NULL,
  "raw" JSONB NOT NULL,
  CONSTRAINT "ChannelSnapshot_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ChannelSnapshot_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "SocialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ChannelSnapshot_socialAccountId_day_key" ON "ChannelSnapshot"("socialAccountId", "day");
