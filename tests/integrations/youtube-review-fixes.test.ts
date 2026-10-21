import test from 'node:test';
import assert from 'node:assert/strict';
import {RecoveryService} from '../../apps/worker/src/maintenance/recovery.service.ts';
import {MemoryRepositories} from '../../packages/shared/src/memory-repositories.ts';
import {MemoryStore} from '../../packages/shared/src/store.ts';
import type {JobQueue} from '../../packages/shared/src/job-queue.ts';
import {preflight} from '../../packages/shared/src/preflight.ts';
import {YouTubeAdapter} from '../../apps/api/src/integrations/google/youtube.adapter.ts';
import {InMemoryObjectStorage} from '../../apps/api/src/modules/media/media.service.ts';
import type {HttpClient,HttpRequest} from '../../packages/shared/src/http.ts';
import {JobRunner} from '../../apps/worker/src/publishing/job-runner.service.ts';
import {PublisherRegistry} from '../../apps/api/src/modules/publishing/publisher-registry.ts';
import {PublishingService} from '../../apps/api/src/modules/publishing/publishing.service.ts';
import {StrategyResolver} from '../../apps/api/src/modules/publishing/strategy-resolver.ts';
import {FakePublisher} from '../../apps/worker/src/testing/fake-publisher.ts';

test('recovery requeues crashed resumable upload rather than polling the session URL',async()=>{
  const repos=new MemoryRepositories(new MemoryStore()),now=Date.now(),scheduled:string[]=[],polled:string[]=[];const queue:JobQueue={schedule:async()=>{},schedulePoll:async id=>{polled.push(id)},reschedule:async id=>{scheduled.push(id)},cancel:async()=>{},close:async()=>{}};
  await repos.publishJobs.insert({id:'job',batchId:'batch',brandId:'brand',socialAccountId:'account',contentVariantId:'variant',platform:'YOUTUBE',strategy:'API',scheduledAt:now-11*60_000,status:'PROCESSING',attemptCount:1,maxAttempts:4,idempotencyKey:'key',processingStartedAt:now-11*60_000,remoteCorrelationId:'resumable:https://upload.test/session'});
  await new RecoveryService(repos).requeueMissing(queue,now);assert.deepEqual(scheduled,['job']);assert.deepEqual(polled,[]);assert.equal((await repos.publishJobs.get('job'))?.status,'RETRYING');
});

test('YouTube title preflight checks caption sent to snippet',()=>{const issues=preflight({platform:'YOUTUBE',format:'VIDEO',title:'Short',caption:'A'.repeat(101),description:'Okay',youtube:{madeForKids:false},hashtags:[],media:[]});assert.ok(issues.some(x=>x.code==='YT_TITLE_MAX'))});

test('YouTube upload refreshes a 401 once before expiring the account',async()=>{
  const calls:HttpRequest[]=[];const http:HttpClient={async request<T>(r:HttpRequest){calls.push(r);if(r.url.includes('uploadType=resumable'))return r.headers?.authorization==='Bearer old'?{status:401,data:{error:{message:'expired'}} as T}:{status:200,data:{} as T,headers:{location:'https://upload.test/session'}};return{status:200,data:{id:'video-1'} as T}}};
  const storage=new InMemoryObjectStorage();await storage.putObject('video',Buffer.from([1,2,3]),'video/mp4');let refreshed=0;
  const adapter=new YouTubeAdapter({baseUrl:'https://youtube.test',http,tokens:async()=> 'old',refreshAccessToken:async()=>{refreshed++;return'new'},storage,audited:true});
  const result=await adapter.publish({brandId:'brand',socialAccountId:'account',contentVariantId:'variant',platform:'YOUTUBE',contentType:'VIDEO',caption:'Title',media:[{url:'https://media.test/video',kind:'VIDEO',mimeType:'video/mp4',width:1,height:2,storageKey:'video',sizeBytes:3}],metadata:{youtube:{madeForKids:false,privacyStatus:'public'}}});
  assert.equal(result.externalPostId,'video-1');assert.equal(refreshed,1);assert.equal(calls.filter(x=>x.url.includes('uploadType=resumable')).length,2);
});

test('private scheduled YouTube video keeps selected privacy and does not set publishAt',async()=>{
  const calls:HttpRequest[]=[],http:HttpClient={async request<T>(r:HttpRequest){calls.push(r);return r.url.includes('uploadType=resumable')?{status:200,data:{} as T,headers:{location:'https://upload.test/session'}}:{status:200,data:{id:'video-private'} as T}}},storage=new InMemoryObjectStorage();await storage.putObject('video',Buffer.from([1,2,3]),'video/mp4');
  const adapter=new YouTubeAdapter({baseUrl:'https://youtube.test',http,tokens:async()=> 'token',storage,audited:true});const result=await adapter.publish({brandId:'brand',socialAccountId:'account',contentVariantId:'variant',platform:'YOUTUBE',contentType:'VIDEO',caption:'Private',media:[{url:'https://media.test/video',kind:'VIDEO',mimeType:'video/mp4',width:1,height:2,storageKey:'video',sizeBytes:3}],metadata:{youtube:{madeForKids:false,privacyStatus:'private'},publishAt:Date.now()+60*60_000}});
  assert.equal(result.externalPostId,'video-private');assert.deepEqual((calls[0]!.body as any).status,{privacyStatus:'private',selfDeclaredMadeForKids:false});
});

test('401 during a chunk refreshes token and resumes the existing session',async()=>{
  const calls:HttpRequest[]=[];const http:HttpClient={async request<T>(r:HttpRequest){calls.push(r);if(r.url.includes('uploadType=resumable'))return{status:200,data:{} as T,headers:{location:'https://upload.test/session'}};if(r.headers?.['content-range']?.startsWith('bytes */'))return{status:308,data:'' as T};if(r.headers?.authorization==='Bearer old')return{status:401,data:{error:{message:'expired'}} as T};return{status:200,data:{id:'video-1'} as T}}};
  const storage=new InMemoryObjectStorage();await storage.putObject('video',Buffer.from([1,2,3]),'video/mp4');let refreshed=0;
  const adapter=new YouTubeAdapter({baseUrl:'https://youtube.test',http,tokens:async()=> 'old',refreshAccessToken:async()=>{refreshed++;return'new'},storage,audited:true});
  const result=await adapter.publish({brandId:'brand',socialAccountId:'account',contentVariantId:'variant',platform:'YOUTUBE',contentType:'VIDEO',caption:'Title',media:[{url:'https://media.test/video',kind:'VIDEO',mimeType:'video/mp4',width:1,height:2,storageKey:'video',sizeBytes:3}],metadata:{youtube:{madeForKids:false,privacyStatus:'public'}}});
  assert.equal(result.externalPostId,'video-1');assert.equal(refreshed,1);assert.equal(calls.filter(x=>x.url.includes('uploadType=resumable')).length,1);assert.equal(calls.filter(x=>x.headers?.['content-range']?.startsWith('bytes */')).length,1);
});

test('thumbnail warning survives publish and appears on calendar entry',async()=>{
  const repos=new MemoryRepositories(new MemoryStore()),registry=new PublisherRegistry(),publisher=new FakePublisher();publisher.publish=async()=>({externalPostId:'video',note:'Không thể đặt ảnh bìa'});registry.register('YOUTUBE','API',publisher);
  await repos.contents.insert({id:'content',brandId:'brand',type:'VIDEO',title:'Title',status:'READY'});await repos.variants.insert({id:'variant',contentItemId:'content',platform:'YOUTUBE',hashtags:[],status:'READY'});await repos.publishBatches.insert({id:'batch',brandId:'brand',contentItemId:'content',createdBy:'owner',createdAt:Date.now()});
  await repos.publishJobs.insert({id:'job',batchId:'batch',brandId:'brand',socialAccountId:'account',contentVariantId:'variant',platform:'YOUTUBE',strategy:'API',scheduledAt:Date.now()-1,status:'QUEUED',attemptCount:0,maxAttempts:4,idempotencyKey:'warning'});
  const status=await new JobRunner(repos,registry).run('job',async()=>({brandId:'brand',socialAccountId:'account',contentVariantId:'variant',platform:'YOUTUBE',contentType:'VIDEO'}));assert.equal(status,'PUBLISHED');
  const entries=await new PublishingService(repos,registry,new StrategyResolver()).listCalendar('brand',Date.now()-60_000,Date.now()+60_000);assert.equal(entries[0]?.warning,'Không thể đặt ảnh bìa');
});

test('retry of an already uploaded scheduled video polls without opening another upload',async()=>{
  const calls:HttpRequest[]=[];const adapter=new YouTubeAdapter({baseUrl:'https://youtube.test',http:{async request<T>(request:HttpRequest){calls.push(request);return{status:200,data:{items:[{id:'video-1',status:{privacyStatus:'private'}}]} as T}}},tokens:async()=> 'token',storage:new InMemoryObjectStorage(),audited:true});
  const result=await adapter.publish({brandId:'brand',socialAccountId:'account',contentVariantId:'variant',platform:'YOUTUBE',contentType:'VIDEO',caption:'Title',remoteCorrelationId:'video:video-1',metadata:{youtube:{madeForKids:false,privacyStatus:'public'}}});
  assert.equal(result.processing,true);assert.equal(calls.length,1);assert.ok(calls[0]?.url.includes('/videos?part=status'));
});
