CREATE TABLE "BioPage" (
  "id" TEXT NOT NULL,
  "brandId" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "links" JSONB NOT NULL,
  CONSTRAINT "BioPage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BioPage_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "BioPage_slug_key" ON "BioPage"("slug");
CREATE INDEX "BioPage_brandId_idx" ON "BioPage"("brandId");
