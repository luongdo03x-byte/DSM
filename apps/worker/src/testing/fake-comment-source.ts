import type {CommentSource} from '../../../../packages/platform-contracts/src/comments.ts';

export class FakeCommentSource implements CommentSource{
  async listSince():Promise<[]>{return[]}
  async reply(_account:unknown,platformCommentId:string):Promise<{platformCommentId:string}>{return{platformCommentId:'test-reply-'+platformCommentId}}
  async hide():Promise<void>{}
  async privateReply():Promise<void>{}
}
