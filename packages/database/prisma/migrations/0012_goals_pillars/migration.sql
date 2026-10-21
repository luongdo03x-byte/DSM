CREATE TABLE "ChannelGoal" (
  "id" TEXT NOT NULL,
  "socialAccountId" TEXT NOT NULL,
  "postsPer28Days" INTEGER NOT NULL,
  "followersTarget" INTEGER,
  "targetDate" TEXT,
  CONSTRAINT "ChannelGoal_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ChannelGoal_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "SocialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ChannelGoal_socialAccountId_key" ON "ChannelGoal"("socialAccountId");

CREATE TABLE "ContentPillar" (
  "id" TEXT NOT NULL,
  "brandId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "color" TEXT NOT NULL,
  "description" TEXT,
  CONSTRAINT "ContentPillar_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ContentPillar_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ContentPillar_brandId_name_key" ON "ContentPillar"("brandId", "name");

ALTER TABLE "ContentItem" ADD COLUMN "pillarId" TEXT;
ALTER TABLE "ContentItem" ADD CONSTRAINT "ContentItem_pillarId_fkey" FOREIGN KEY ("pillarId") REFERENCES "ContentPillar"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "ContentItem_pillarId_idx" ON "ContentItem"("pillarId");
