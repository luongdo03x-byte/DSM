ALTER TABLE "SocialCredential" ADD COLUMN "providerUserId" TEXT;
CREATE INDEX "SocialCredential_providerUserId_idx" ON "SocialCredential"("providerUserId");
