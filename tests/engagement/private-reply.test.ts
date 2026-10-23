import test from 'node:test';
import assert from 'node:assert/strict';
import {MemoryRepositories} from '../../packages/shared/src/memory-repositories.ts';
import {MemoryStore} from '../../packages/shared/src/store.ts';
import {EngagementService} from '../../apps/api/src/modules/engagement/engagement.service.ts';
import {runRulesForComment} from '../../apps/worker/src/engagement/run-rules.job.ts';
import {MetaGraphClient} from '../../apps/api/src/integrations/meta/meta-http.client.ts';
import {FacebookAdapter} from '../../apps/api/src/integrations/meta/facebook.adapter.ts';
import {InstagramAdapter} from '../../apps/api/src/integrations/meta/instagram.adapter.ts';

const DAY=86_400_000;
async function setup(createdAt=Date.now(),send=async()=>{}){
  const repos=new MemoryRepositories(new MemoryStore());
  await repos.socialAccounts.insert({id:'a',brandId:'b',platform:'FACEBOOK',platformAccountId:'page',publishMode:'API',status:'CONNECTED'});
  await repos.socialComments.insert({id:'c',brandId:'b',socialAccountId:'a',platform:'FACEBOOK',platformCommentId:'remote-c',platformPostId:'p',authorId:'customer',authorName:'An',isFromPage:false,text:'Xin giá',createdAt,status:'NEW'});
  const service=new EngagementService(repos,{FACEBOOK:{listSince:async()=>[],reply:async()=>({platformCommentId:'reply'}),privateReply:async()=>send()}});
  return{repos,service};
}
test('gửi nhắn riêng một lần rồi khóa, kể cả gọi đồng thời',async()=>{
  let sent=0;const {repos,service}=await setup(Date.now(),async()=>{sent++;await new Promise(resolve=>setTimeout(resolve,10))});
  const results=await Promise.allSettled([service.privateReply('b','c','Chào An','u'),service.privateReply('b','c','Chào An','u')]);
  assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
  assert.equal(sent,1);
  await assert.rejects(service.privateReply('b','c','Lần hai','u'),{message:'PRIVATE_REPLY_ALREADY_SENT'});
  assert.equal((await repos.socialComments.get('c'))?.privateReplySentAt!==undefined,true);
});
test('private reply quá 7 ngày bị từ chối',async()=>{
  const {service}=await setup(Date.now()-7*DAY-1000);
  await assert.rejects(service.privateReply('b','c','Muộn','u'),{message:'PRIVATE_REPLY_WINDOW_CLOSED'});
});
test('quy tắc tự động cũng chỉ gửi một lần',async()=>{
  let sent=0;const {repos,service}=await setup(Date.now(),async()=>{sent++});
  await repos.automationRules.insert({id:'r',brandId:'b',name:'Giá',enabled:true,platforms:['FACEBOOK'],match:{keywords:['giá'],mode:'ANY'},actions:{privateReply:'Chào {ten}'},maxPerHour:30});
  assert.equal(await runRulesForComment(repos,'c',service),1);
  assert.equal(await runRulesForComment(repos,'c',service),0);
  assert.equal(sent,1);
});
test('Meta adapters gửi private reply tới đúng Page/Instagram ID và comment ID',async()=>{
  const calls:Array<{url:string;body:unknown}>=[];
  const graph=new MetaGraphClient({baseUrl:'https://graph.test',version:'v24.0',fetchImpl:async(input,init)=>{calls.push({url:String(input),body:JSON.parse(String(init?.body))});return Response.json({recipient_id:'recipient'})}});
  const account={id:'a',brandId:'b',platform:'FACEBOOK' as const,platformAccountId:'page',publishMode:'API' as const,status:'CONNECTED' as const};
  await new FacebookAdapter({graph,tokens:async()=> 'token'}).privateReply(account,'comment-fb','Xin chào');
  await new InstagramAdapter({graph,tokens:async()=> 'token',accountIds:async()=> 'ig-account'}).privateReply({...account,platform:'INSTAGRAM'},'comment-ig','Chào bạn');
  assert.deepEqual(calls.map(call=>new URL(call.url).pathname),['/v24.0/page/messages','/v24.0/ig-account/messages']);
  assert.deepEqual(calls.map(call=>call.body),[{recipient:{comment_id:'comment-fb'},message:{text:'Xin chào'}},{recipient:{comment_id:'comment-ig'},message:{text:'Chào bạn'}}]);
});
