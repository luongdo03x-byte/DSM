import {createHmac, timingSafeEqual} from 'node:crypto';
import type {PendingMetaComment} from '../../../../../packages/shared/src/domain.ts';

export type MetaCommentEvent=PendingMetaComment;

export function verifySignature(rawBody:Buffer, header:string|undefined, appSecret:string):boolean {
  if(!header?.startsWith('sha256=')||!appSecret)return false;
  const hex=header.slice(7);
  if(!/^[0-9a-fA-F]{64}$/.test(hex))return false;
  const actual=Buffer.from(hex,'hex');
  const expected=createHmac('sha256',appSecret).update(rawBody).digest();
  return timingSafeEqual(actual,expected);
}

function record(value:unknown):Record<string,unknown>|undefined {
  return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:undefined;
}
function string(value:unknown):string {return typeof value==='string'?value:''}
function timestamp(value:unknown, fallback:unknown):number {
  if(typeof value==='number'&&Number.isFinite(value))return value<1e12?value*1000:value;
  if(typeof value==='string'){
    const parsed=Number(value);
    if(Number.isFinite(parsed))return parsed<1e12?parsed*1000:parsed;
    const date=Date.parse(value);if(Number.isFinite(date))return date;
  }
  if(value!==fallback)return timestamp(fallback,0);
  return 0;
}

export function parseMetaWebhook(body:unknown):MetaCommentEvent[] {
  const root=record(body),platform=root?.object==='page'?'FACEBOOK':root?.object==='instagram'?'INSTAGRAM':undefined;
  if(!platform||!Array.isArray(root?.entry))return[];
  const events:MetaCommentEvent[]=[];
  for(const item of root.entry){
    const entry=record(item),accountId=string(entry?.id);
    if(!accountId||!Array.isArray(entry?.changes))continue;
    for(const itemChange of entry.changes){
      const change=record(itemChange),value=record(change?.value);
      if(!value||change?.field!==(platform==='FACEBOOK'?'feed':'comments'))continue;
      if(platform==='FACEBOOK'&&value.item!=='comment')continue;
      const verb=platform==='FACEBOOK'?(value.verb==='remove'?'remove':value.verb==='edited'?'edited':'add'):(value.verb==='remove'?'remove':value.verb==='edited'?'edited':'add');
      const author=record(value.from),media=record(value.media);
      const platformCommentId=string(platform==='FACEBOOK'?value.comment_id:value.id);
      const platformPostId=string(platform==='FACEBOOK'?value.post_id:media?.id);
      if(!platformCommentId||!platformPostId)continue;
      events.push({socialPlatformAccountId:accountId,platform,platformCommentId,platformPostId,
        authorId:string(author?.id),authorName:string(author?.name)||string(author?.username),text:string(value.message)||string(value.text),
        createdAt:timestamp(value.created_time??value.timestamp,entry.time),verb});
    }
  }
  return events;
}
