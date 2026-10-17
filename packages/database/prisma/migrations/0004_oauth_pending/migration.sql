CREATE TABLE "OAuthPending" (
  "id" TEXT NOT NULL,
  "brandId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "ciphertext" TEXT NOT NULL,
  "iv" TEXT NOT NULL,
  "authTag" TEXT NOT NULL,
  "expiresAt" BIGINT NOT NULL,
  "consumedAt" BIGINT,
  CONSTRAINT "OAuthPending_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OAuthPending_tokenHash_key" ON "OAuthPending"("tokenHash");
CREATE INDEX "OAuthPending_expiresAt_idx" ON "OAuthPending"("expiresAt");
ALTER TABLE "OAuthPending" ADD CONSTRAINT "OAuthPending_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;
