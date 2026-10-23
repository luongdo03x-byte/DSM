CREATE UNIQUE INDEX "CommentAction_private_reply_once" ON "CommentAction"("commentId") WHERE "kind" = 'PRIVATE_REPLY';
