import type {SocialAccount, SocialComment} from '../../shared/src/domain.ts';

export interface CommentSource {
  listSince(account: SocialAccount, since: number): Promise<Omit<SocialComment, 'id'|'brandId'|'status'>[]>;
  reply(account: SocialAccount, platformCommentId: string, text: string): Promise<{platformCommentId: string}>;
  hide?(account: SocialAccount, platformCommentId: string, hidden: boolean): Promise<void>;
  privateReply?(account: SocialAccount, platformCommentId: string, text: string): Promise<void>;
}
