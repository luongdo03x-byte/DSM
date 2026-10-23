import type {Platform,SocialComment,CommentAction} from '../../../../../packages/shared/src/domain.ts';
import type {Repositories} from '../../../../../packages/shared/src/repositories.ts';
import type {CommentSource} from '../../../../../packages/platform-contracts/src/comments.ts';
import {id} from '../../../../../packages/shared/src/ids.ts';

export type CommentSources=Partial<Record<Platform,CommentSource>>;
export type CommentFilter={status?:SocialComment['status'][];platform?:Platform;cursor?:string;limit?:number};

function gone(error:unknown):boolean{
  const value=error as {code?:string;message?:string};
  return ['HTTP_404','404','commentNotFound','parentCommentNotFound'].includes(String(value?.code??'')) ||
    String(value?.code)==='100'&&/does not exist|not found|deleted/i.test(String(value?.message??''));
}
function cursorOf(row:SocialComment):string{return Buffer.from(JSON.stringify([row.createdAt,row.id])).toString('base64url')}
function readCursor(value:string):[number,string]{
  try{const data:unknown=JSON.parse(Buffer.from(value,'base64url').toString());if(Array.isArray(data)&&Number.isFinite(data[0])&&typeof data[1]==='string')return[data[0],data[1]]}catch{}
  throw new Error('INVALID_CURSOR');
}

export class EngagementService{
  private readonly repos:Repositories;
  private readonly sources:CommentSources;
  constructor(repos:Repositories,sources:CommentSources){this.repos=repos;this.sources=sources}

  async list(brandId:string,filter:CommentFilter={}):Promise<{items:SocialComment[];nextCursor?:string}>{
    const limit=Math.min(100,Math.max(1,Math.floor(filter.limit??30)));
    const cursor=filter.cursor?readCursor(filter.cursor):undefined;
    const rows=(await this.repos.socialComments.findBy({brandId}))
      .filter(row=>!filter.status||filter.status.includes(row.status))
      .filter(row=>!filter.platform||row.platform===filter.platform)
      .sort((a,b)=>b.createdAt-a.createdAt||b.id.localeCompare(a.id))
      .filter(row=>!cursor||row.createdAt<cursor[0]||row.createdAt===cursor[0]&&row.id<cursor[1]);
    const items=rows.slice(0,limit);
    return{items,...(rows.length>limit&&items.length?{nextCursor:cursorOf(items[items.length-1]!)}:{})};
  }

  private async context(brandId:string,commentId:string){
    const comment=await this.repos.socialComments.get(commentId);
    if(!comment||comment.brandId!==brandId)throw new Error('COMMENT_NOT_FOUND');
    const account=await this.repos.socialAccounts.get(comment.socialAccountId);
    if(!account||account.brandId!==brandId||account.status!=='CONNECTED')throw new Error('ACCOUNT_NOT_CONNECTED');
    return{comment,account};
  }

  async reply(brandId:string,commentId:string,text:string,userId:string,ruleId?:string):Promise<SocialComment>{
    const {comment,account}=await this.context(brandId,commentId);
    if(comment.status==='DELETED')throw new Error('COMMENT_GONE');
    const message=text.trim();if(!message)throw new Error('INVALID_REPLY');
    const source=this.sources[comment.platform];if(!source)throw new Error('NOT_SUPPORTED');
    const action:CommentAction={id:id('comment-action'),commentId,kind:'REPLY',text:message,userId,...(ruleId?{ruleId}:{}),status:'PENDING',createdAt:Date.now()};
    await this.repos.commentActions.insert(action);
    try{
      await source.reply(account,comment.platformCommentId,message);
      await this.repos.commentActions.update(action.id,{status:'DONE'});
      return this.repos.socialComments.update(comment.id,{status:'REPLIED'});
    }catch(error){
      const errorCode=gone(error)?'COMMENT_GONE':String((error as {code?:string})?.code??'PLATFORM_ERROR');
      await this.repos.commentActions.update(action.id,{status:'FAILED',errorCode});
      if(errorCode==='COMMENT_GONE'){await this.repos.socialComments.update(comment.id,{status:'DELETED'});throw new Error(errorCode)}
      throw error;
    }
  }

  async hide(brandId:string,commentId:string,hidden:boolean,userId:string,ruleId?:string):Promise<SocialComment>{
    const {comment,account}=await this.context(brandId,commentId);
    if(comment.platform==='YOUTUBE'||comment.platform==='TIKTOK')throw new Error('NOT_SUPPORTED');
    if(comment.status==='DELETED')throw new Error('COMMENT_GONE');
    const source=this.sources[comment.platform];if(!source?.hide)throw new Error('NOT_SUPPORTED');
    const action:CommentAction={id:id('comment-action'),commentId,kind:hidden?'HIDE':'UNHIDE',userId,...(ruleId?{ruleId}:{}),status:'PENDING',createdAt:Date.now()};
    await this.repos.commentActions.insert(action);
    try{await source.hide(account,comment.platformCommentId,hidden);await this.repos.commentActions.update(action.id,{status:'DONE'});return this.repos.socialComments.update(comment.id,{status:hidden?'HIDDEN':'READ'})}
    catch(error){const errorCode=gone(error)?'COMMENT_GONE':String((error as {code?:string})?.code??'PLATFORM_ERROR');await this.repos.commentActions.update(action.id,{status:'FAILED',errorCode});if(errorCode==='COMMENT_GONE'){await this.repos.socialComments.update(comment.id,{status:'DELETED'});throw new Error(errorCode)}throw error}
  }

  async privateReply(brandId:string,commentId:string,text:string,userId:string,ruleId?:string):Promise<SocialComment>{
    const {comment,account}=await this.context(brandId,commentId);
    if(comment.platform!=='FACEBOOK'&&comment.platform!=='INSTAGRAM'||comment.isFromPage)throw new Error('NOT_SUPPORTED');
    if(comment.status==='DELETED')throw new Error('COMMENT_GONE');
    if(comment.privateReplySentAt||(await this.repos.commentActions.findBy({commentId,kind:'PRIVATE_REPLY'})).length)throw new Error('PRIVATE_REPLY_ALREADY_SENT');
    if(Date.now()-comment.createdAt>=7*86_400_000)throw new Error('PRIVATE_REPLY_WINDOW_CLOSED');
    const message=text.trim();if(!message)throw new Error('INVALID_REPLY');
    const source=this.sources[comment.platform];if(!source?.privateReply)throw new Error('NOT_SUPPORTED');
    const action:CommentAction={id:id('comment-action'),commentId,kind:'PRIVATE_REPLY',text:message,userId,...(ruleId?{ruleId}:{}),status:'PENDING',createdAt:Date.now()};
    try{await this.repos.commentActions.insert(action)}catch(error){if(error instanceof Error&&error.message==='DUPLICATE_ID')throw new Error('PRIVATE_REPLY_ALREADY_SENT');throw error}
    try{await source.privateReply(account,comment.platformCommentId,message);await this.repos.commentActions.update(action.id,{status:'DONE'});return this.repos.socialComments.update(comment.id,{privateReplySentAt:Date.now()})}
    catch(error){const errorCode=gone(error)?'COMMENT_GONE':String((error as {code?:string})?.code??'DELIVERY_UNKNOWN');await this.repos.commentActions.update(action.id,{status:'FAILED',errorCode});if(errorCode==='COMMENT_GONE')await this.repos.socialComments.update(comment.id,{status:'DELETED'});throw error}
  }

  async read(brandId:string,commentId:string):Promise<SocialComment>{const {comment}=await this.context(brandId,commentId);if(comment.status==='DELETED')throw new Error('COMMENT_GONE');return this.repos.socialComments.update(comment.id,{status:'READ'})}
}
