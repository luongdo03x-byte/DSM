import type {Repositories} from '../../../../packages/shared/src/repositories.ts';
import type {Platform,SocialComment} from '../../../../packages/shared/src/domain.ts';
import type {CommentSource} from '../../../../packages/platform-contracts/src/comments.ts';
import {id} from '../../../../packages/shared/src/ids.ts';
import type {EngagementService} from '../../../api/src/modules/engagement/engagement.service.ts';
import {runRulesForComment} from './run-rules.job.ts';

const THIRTY_DAYS=30*24*60*60_000;
export const COMMENT_POLL_INTERVAL_MS=10*60_000;

export async function pollComments(repos:Repositories,sources:Partial<Record<Platform,CommentSource>>,now=Date.now(),engagement?:EngagementService):Promise<number>{
  let created=0;
  for(const account of await repos.socialAccounts.findBy({status:'CONNECTED'})){
    if(account.platform!=='YOUTUBE'&&account.platform!=='TIKTOK')continue;
    const source=sources[account.platform];if(!source)continue;
    if(account.commentsPolledAt&&now-account.commentsPolledAt<COMMENT_POLL_INTERVAL_MS)continue;
    const posts=await repos.publishedPosts.findBy({socialAccountId:account.id});
    if(!posts.some(post=>post.publishedAt>=now-THIRTY_DAYS))continue;
    const since=account.commentsPolledAt??now-THIRTY_DAYS;
    const comments=await source.listSince(account,since);
    for(const value of comments){
      if(value.createdAt<since)continue;
      const existing=(await repos.socialComments.findBy({platform:account.platform,platformCommentId:value.platformCommentId}))[0];
      if(existing){if(existing.text!==value.text)await repos.socialComments.update(existing.id,{text:value.text});continue}
      const publishedPost=posts.find(post=>post.platformPostId===value.platformPostId);
      const row:SocialComment={...value,id:id('comment'),brandId:account.brandId,socialAccountId:account.id,platform:account.platform,
        ...(publishedPost?{publishedPostId:publishedPost.id}:{}),status:'NEW'};
      try{await repos.socialComments.insert(row);created++;if(engagement)await runRulesForComment(repos,row.id,engagement,now)}catch(error){if(!(error instanceof Error&&error.message==='DUPLICATE_ID'))throw error}
    }
    await repos.socialAccounts.update(account.id,{commentsPolledAt:now});
  }
  return created;
}
