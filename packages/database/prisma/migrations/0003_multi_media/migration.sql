ALTER TYPE "Platform" ADD VALUE IF NOT EXISTS 'YOUTUBE';
ALTER TYPE "ContentType" ADD VALUE IF NOT EXISTS 'ALBUM';

CREATE TYPE "ContentFormat" AS ENUM ('TEXT', 'LINK', 'IMAGE', 'ALBUM', 'VIDEO', 'REEL', 'STORY', 'SHORT');

ALTER TABLE "MediaAsset"
  ADD COLUMN "derivedFromAssetId" TEXT,
  ADD COLUMN "variantKey" TEXT,
  ADD COLUMN "exifStripped" BOOLEAN,
  ADD COLUMN "codec" TEXT;
CREATE UNIQUE INDEX "MediaAsset_derivedFromAssetId_variantKey_key" ON "MediaAsset"("derivedFromAssetId", "variantKey");
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_derivedFromAssetId_fkey"
  FOREIGN KEY ("derivedFromAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ContentVariant"
  ADD COLUMN "format" "ContentFormat",
  ADD COLUMN "title" TEXT,
  ADD COLUMN "skippedReason" TEXT;

CREATE TABLE "ContentMedia" (
  "id" TEXT NOT NULL,
  "contentItemId" TEXT NOT NULL,
  "mediaAssetId" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  CONSTRAINT "ContentMedia_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ContentMedia_contentItemId_position_key" ON "ContentMedia"("contentItemId", "position");
CREATE INDEX "ContentMedia_mediaAssetId_idx" ON "ContentMedia"("mediaAssetId");
ALTER TABLE "ContentMedia" ADD CONSTRAINT "ContentMedia_contentItemId_fkey"
  FOREIGN KEY ("contentItemId") REFERENCES "ContentItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContentMedia" ADD CONSTRAINT "ContentMedia_mediaAssetId_fkey"
  FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "VariantMedia" (
  "id" TEXT NOT NULL,
  "contentVariantId" TEXT NOT NULL,
  "mediaAssetId" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "crop" JSONB,
  "isCover" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "VariantMedia_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "VariantMedia_contentVariantId_position_key" ON "VariantMedia"("contentVariantId", "position");
CREATE INDEX "VariantMedia_mediaAssetId_idx" ON "VariantMedia"("mediaAssetId");
ALTER TABLE "VariantMedia" ADD CONSTRAINT "VariantMedia_contentVariantId_fkey"
  FOREIGN KEY ("contentVariantId") REFERENCES "ContentVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VariantMedia" ADD CONSTRAINT "VariantMedia_mediaAssetId_fkey"
  FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
