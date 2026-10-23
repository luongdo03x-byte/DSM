CREATE TABLE "SocialComment" (
  "id" TEXT NOT NULL,
  "brandId" TEXT NOT NULL,
  "socialAccountId" TEXT NOT NULL,
  "platform" "Platform" NOT NULL,
  "platformCommentId" TEXT NOT NULL,
  "platformPostId" TEXT NOT NULL,
  "publishedPostId" TEXT,
  "parentCommentId" TEXT,
  "authorId" TEXT NOT NULL,
  "authorName" TEXT NOT NULL,
  "isFromPage" BOOLEAN NOT NULL,
  "text" TEXT NOT NULL,
  "createdAt" BIGINT NOT NULL,
  "status" TEXT NOT NULL,
  "privateReplySentAt" BIGINT,
  CONSTRAINT "SocialComment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SocialComment_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SocialComment_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "SocialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SocialComment_publishedPostId_fkey" FOREIGN KEY ("publishedPostId") REFERENCES "PublishedPost"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "SocialComment_platform_platformCommentId_key" ON "SocialComment"("platform", "platformCommentId");
CREATE INDEX "SocialComment_brandId_createdAt_id_idx" ON "SocialComment"("brandId", "createdAt", "id");
CREATE INDEX "SocialComment_socialAccountId_idx" ON "SocialComment"("socialAccountId");

CREATE TABLE "CommentAction" (
  "id" TEXT NOT NULL,
  "commentId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "text" TEXT,
  "ruleId" TEXT,
  "userId" TEXT,
  "status" TEXT NOT NULL,
  "errorCode" TEXT,
  "createdAt" BIGINT NOT NULL,
  CONSTRAINT "CommentAction_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CommentAction_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "SocialComment"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "CommentAction_commentId_createdAt_idx" ON "CommentAction"("commentId", "createdAt");
