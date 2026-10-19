import test from 'node:test';
import assert from 'node:assert/strict';
import {PublishingService} from '../../apps/api/src/modules/publishing/publishing.service.ts';
import {PublisherRegistry} from '../../apps/api/src/modules/publishing/publisher-registry.ts';
import {StrategyResolver} from '../../apps/api/src/modules/publishing/strategy-resolver.ts';
import {MemoryRepositories} from '../../packages/shared/src/memory-repositories.ts';
import {MemoryStore} from '../../packages/shared/src/store.ts';
import type {JobQueue} from '../../packages/shared/src/job-queue.ts';
import type {PublishJob} from '../../packages/shared/src/domain.ts';
import {createDevelopmentRuntime} from '../../apps/api/src/runtime/dev-runtime.ts';
import {randomBytes} from 'node:crypto';

const now=Date.UTC(2026,9,19,12);
function setup(){
  const repos=new MemoryRepositories(new MemoryStore()),rescheduled:Array<{jobId:string;at:number}>=[];
  const queue:JobQueue={schedule:async()=>{},schedulePoll:async()=>{},reschedule:async(jobId,at)=>{rescheduled.push({jobId,at})},cancel:async()=>{},close:async()=>{}};
  return{repos,rescheduled,service:new PublishingService(repos,new PublisherRegistry(),new StrategyResolver(),queue)};
}
function job(id:string,at:number,status:PublishJob['status']='QUEUED'):PublishJob{return{id,batchId:'batch',brandId:'brand',socialAccountId:'account',contentVariantId:'variant',platform:'FACEBOOK',strategy:'API',scheduledAt:at,status,attemptCount:0,maxAttempts:4,idempotencyKey:id}}
async function seed(repos:MemoryRepositories){
  await repos.contents.insert({id:'content',brandId:'brand',type:'IMAGE',title:'Ảnh thử',status:'READY'});
  await repos.variants.insert({id:'variant',contentItemId:'content',platform:'FACEBOOK',format:'IMAGE',hashtags:[],status:'READY'});
  await repos.publishBatches.insert({id:'batch',brandId:'brand',contentItemId:'content',createdBy:'owner',createdAt:now});
}

test('calendar range is half-open and returns content details',async()=>{
  const {repos,service}=setup();await seed(repos);
  await repos.publishJobs.insert(job('before',now-1));
  await repos.publishJobs.insert(job('first',now));
  await repos.publishJobs.insert(job('middle',now+1_000,'PUBLISHED'));
  await repos.publishJobs.insert(job('end',now+2_000));
  await repos.publishedPosts.insert({id:'post',brandId:'brand',publishJobId:'middle',socialAccountId:'account',contentVariantId:'variant',platform:'FACEBOOK',platformPostId:'remote',platformPostUrl:'https://facebook.test/remote',publishedAt:now+1_000});
  const entries=await service.listCalendar('brand',now,now+2_000);
  assert.deepEqual(entries.map(entry=>entry.jobId),['first','middle']);
  assert.deepEqual(entries[1],{jobId:'middle',contentItemId:'content',title:'Ảnh thử',platform:'FACEBOOK',socialAccountId:'account',format:'IMAGE',scheduledAt:now+1_000,status:'PUBLISHED',publishedUrl:'https://facebook.test/remote'});
});

test('reschedule updates a queued job and its queue delivery',async()=>{
  const {repos,service,rescheduled}=setup();await seed(repos);await repos.publishJobs.insert(job('job',now));
  const at=now+10*60_000;
  const entry=await service.reschedule('brand','job',at,now);
  assert.equal(entry.scheduledAt,at);
  assert.equal((await repos.publishJobs.get('job'))?.scheduledAt,at);
  assert.deepEqual(rescheduled,[{jobId:'job',at}]);
});

test('reschedule rejects published, too-soon and too-far dates',async()=>{
  const {repos,service}=setup();await seed(repos);
  await repos.publishJobs.insert(job('published',now,'PUBLISHED'));
  await repos.publishJobs.insert(job('queued',now));
  await assert.rejects(service.reschedule('brand','published',now+10*60_000,now),{message:'JOB_NOT_RESCHEDULABLE'});
  await assert.rejects(service.reschedule('brand','queued',now+5*60_000-1,now),{message:'SCHEDULE_TOO_SOON'});
  await assert.rejects(service.reschedule('brand','queued',now+76*24*60*60_000,now),{message:'SCHEDULE_TOO_FAR'});
  assert.equal((await repos.publishJobs.get('queued'))?.scheduledAt,now);
});

test('calendar HTTP range and reschedule expose safe status codes',async()=>{
  const app=await createDevelopmentRuntime({env:{DEV_OWNER_EMAIL:'owner@calendar.test',DEV_OWNER_PASSWORD:'secret',JWT_ACCESS_SECRET:'calendar-secret',CREDENTIAL_ENCRYPTION_KEY:randomBytes(32).toString('base64')}});
  const brandId=app.ids.brandId;
  await app.repos.contents.insert({id:'c',brandId,type:'TEXT',title:'Bài lịch',status:'READY'});
  await app.repos.variants.insert({id:'v',contentItemId:'c',platform:'FACEBOOK',format:'TEXT',hashtags:[],status:'READY'});
  await app.repos.publishBatches.insert({id:'b',brandId,contentItemId:'c',createdBy:app.ids.ownerId,createdAt:now});
  await app.repos.publishJobs.insert({...job('due',now),brandId,batchId:'b',contentVariantId:'v'});
  await app.repos.publishJobs.insert({...job('past',now-1),brandId,batchId:'b',contentVariantId:'v',status:'PUBLISHED'});
  const login=await app.runtime.handle({method:'POST',path:'/auth/login',body:{email:'owner@calendar.test',password:'secret'}});
  assert.equal(login.status,200);const token=(login.body as {accessToken:string}).accessToken;
  const headers={authorization:'Bearer '+token};
  const range=await app.runtime.handle({method:'GET',path:`/brands/${brandId}/calendar`,headers,query:{from:String(now),to:String(now+1)}});
  assert.equal(range.status,200);assert.deepEqual((range.body as Array<{jobId:string}>).map(x=>x.jobId),['due']);
  const published=await app.runtime.handle({method:'PATCH',path:`/brands/${brandId}/calendar/past`,headers,body:{scheduledAt:Date.now()+10*60_000}});
  assert.deepEqual(published,{status:409,body:{error:'JOB_NOT_RESCHEDULABLE'}});
  const tooSoon=await app.runtime.handle({method:'PATCH',path:`/brands/${brandId}/calendar/due`,headers,body:{scheduledAt:Date.now()+60_000}});
  assert.deepEqual(tooSoon,{status:400,body:{error:'SCHEDULE_TOO_SOON'}});
});
