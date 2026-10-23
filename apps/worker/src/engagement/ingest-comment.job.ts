import type {Repositories} from '../../../../packages/shared/src/repositories.ts';
import type {SocialComment} from '../../../../packages/shared/src/domain.ts';
import {id} from '../../../../packages/shared/src/ids.ts';
import type {MetaCommentEvent} from '../../../api/src/integrations/meta/meta-webhook.ts';
import type {MemoryStore} from '../../../../packages/shared/src/store.ts';
import type {EngagementService} from '../../../api/src/modules/engagement/engagement.service.ts';
import {runRulesForComment} from './run-rules.job.ts';

export async function ingestComment(repos:Repositories,event:MetaCommentEvent):Promise<'CREATED'|'UPDATED'|'DUPLICATE'|'IGNORED'> {
  const account=(await repos.socialAccounts.findBy({platform:event.platform,platformAccountId:event.socialPlatformAccountId,status:'CONNECTED'}))[0];
  if(!account)return'IGNORED';
  const existing=(await repos.socialComments.findBy({platform:event.platform,platformCommentId:event.platformCommentId}))[0];
  if(event.verb==='remove'){
    if(!existing)return'IGNORED';
    if(existing.status==='DELETED')return'DUPLICATE';
    await repos.socialComments.update(existing.id,{status:'DELETED'});return'UPDATED';
  }
  if(existing){
    if(event.verb==='add'&&existing.text===event.text)return'DUPLICATE';
    if(existing.text===event.text)return'DUPLICATE';
    await repos.socialComments.update(existing.id,{text:event.text});return'UPDATED';
  }
  const publishedPost=(await repos.publishedPosts.findBy({socialAccountId:account.id,platformPostId:event.platformPostId}))[0];
  const row:SocialComment={id:id('comment'),brandId:account.brandId,socialAccountId:account.id,platform:event.platform,
    platformCommentId:event.platformCommentId,platformPostId:event.platformPostId,
    ...(publishedPost?{publishedPostId:publishedPost.id}:{}),authorId:event.authorId,authorName:event.authorName,
    isFromPage:event.authorId===event.socialPlatformAccountId,text:event.text,createdAt:event.createdAt,status:'NEW'};
  try{await repos.socialComments.insert(row)}catch(error){if(error instanceof Error&&error.message==='DUPLICATE_ID')return'DUPLICATE';throw error}
  return'CREATED';
}

export async function runPendingMetaComments(store:MemoryStore,repos:Repositories,engagement?:EngagementService):Promise<number>{
  let processed=0;
  for(const [eventId,event] of store.metaWebhookEvents){
    const result=await ingestComment(repos,event);
    if(result==='CREATED'&&engagement){const comment=(await repos.socialComments.findBy({platform:event.platform,platformCommentId:event.platformCommentId}))[0];if(comment)await runRulesForComment(repos,comment.id,engagement)}
    store.metaWebhookEvents.delete(eventId);
    processed++;
  }
  return processed;
}
