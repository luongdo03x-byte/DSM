import test from 'node:test';
import assert from 'node:assert/strict';
import {PublishingService} from '../../apps/api/src/modules/publishing/publishing.service.ts';
import {PublisherRegistry} from '../../apps/api/src/modules/publishing/publisher-registry.ts';
import {StrategyResolver} from '../../apps/api/src/modules/publishing/strategy-resolver.ts';
import {YouTubeAdapter} from '../../apps/api/src/integrations/google/youtube.adapter.ts';
import {InMemoryObjectStorage} from '../../apps/api/src/modules/media/media.service.ts';
import {MemoryRepositories} from '../../packages/shared/src/memory-repositories.ts';
import {MemoryStore} from '../../packages/shared/src/store.ts';
import type {HttpClient,HttpRequest} from '../../packages/shared/src/http.ts';
import type {JobQueue} from '../../packages/shared/src/job-queue.ts';

const now=Date.UTC(2026,9,21,12),later=now+60*60_000;
function setup(){const repos=new MemoryRepositories(new MemoryStore()),calls:HttpRequest[]=[],scheduled:Array<{id:string;at:number}>=[];let privacy='private';
  const http:HttpClient={async request<T>(r:HttpRequest){calls.push(r);if(r.url.includes('uploadType=resumable'))return{status:200,data:{} as T,headers:{location:'https://upload.test/session'}};if(r.url==='https://upload.test/session')return{status:200,data:{id:'video-1'} as T};if(r.url.includes('/videos?'))return{status:200,data:{items:[{id:'video-1',status:{privacyStatus:privacy}}]} as T};return{status:200,data:{} as T}}};
  const storage=new InMemoryObjectStorage(),adapter=new YouTubeAdapter({baseUrl:'https://youtube.test',http,tokens:async()=> 'token',storage,audited:true});const registry=new PublisherRegistry();registry.register('YOUTUBE','API',adapter);
  const queue:JobQueue={schedule:async(id,at)=>{scheduled.push({id,at})},schedulePoll:async()=>{},reschedule:async(id,at)=>{scheduled.push({id,at})},cancel:async()=>{},close:async()=>{}};
  return{repos,calls,scheduled,storage,adapter,setPrivacy:(next:string)=>{privacy=next},service:new PublishingService(repos,registry,new StrategyResolver(),queue)};
}
test('far YouTube schedule queues early and uploads private with publishAt',async()=>{
  const f=setup();await f.repos.workspaces.insert({id:'w',name:'Workspace'});await f.repos.brands.insert({id:'b',workspaceId:'w',name:'Brand',slug:'b',language:'vi',timezone:'Asia/Bangkok',currency:'VND',status:'ACTIVE'});
  await f.repos.contents.insert({id:'c',brandId:'b',type:'VIDEO',title:'Video',status:'READY'});await f.repos.variants.insert({id:'v',contentItemId:'c',platform:'YOUTUBE',format:'SHORT',caption:'Title',body:'Description',hashtags:[],status:'READY',youtube:{madeForKids:false,privacyStatus:'public',categoryId:'22',tags:[]}});
  await f.repos.socialAccounts.insert({id:'a',brandId:'b',platform:'YOUTUBE',publishMode:'API',status:'CONNECTED'});
  const original=Date.now;Date.now=()=>now;try{const result=await f.service.createBatch({brandId:'b',contentId:'c',createdBy:'owner',socialAccountIds:['a'],scheduledAt:later});const job=await f.repos.publishJobs.get(result.results[0]!.jobId!);assert.equal(job?.scheduledAt,now);assert.equal(job?.publishAt,later);assert.equal(f.scheduled[0]?.at,now)}finally{Date.now=original}
  await f.storage.putObject('video',Buffer.from([1,2,3]),'video/mp4');
  const published=await f.adapter.publish({brandId:'b',socialAccountId:'a',contentVariantId:'v',platform:'YOUTUBE',contentType:'VIDEO',caption:'Title',body:'Description',media:[{url:'https://media.test',mimeType:'video/mp4',kind:'VIDEO',width:1080,height:1920,storageKey:'video',sizeBytes:3}],metadata:{youtube:{madeForKids:false,privacyStatus:'public'},publishAt:later}});
  assert.equal(published.processing,true);assert.equal(published.remoteCorrelationId,'video:video-1');const init=f.calls.find(x=>x.url.includes('uploadType=resumable'))!;assert.deepEqual((init.body as any).status,{privacyStatus:'private',selfDeclaredMadeForKids:false,publishAt:new Date(later).toISOString()});
});
test('reschedule uploaded YouTube video updates status only, then poll waits for public',async()=>{
  const f=setup();await f.repos.contents.insert({id:'c',brandId:'b',type:'VIDEO',title:'Video',status:'READY'});await f.repos.variants.insert({id:'v',contentItemId:'c',platform:'YOUTUBE',hashtags:[],status:'READY'});await f.repos.publishBatches.insert({id:'batch',brandId:'b',contentItemId:'c',createdBy:'owner',createdAt:now});
  await f.repos.publishJobs.insert({id:'job',batchId:'batch',brandId:'b',socialAccountId:'a',contentVariantId:'v',platform:'YOUTUBE',strategy:'API',scheduledAt:now,status:'PROCESSING',attemptCount:1,maxAttempts:4,idempotencyKey:'key',remoteCorrelationId:'video:video-1',publishAt:later});
  const entry=await f.service.reschedule('b','job',later+60*60_000,now);assert.equal(entry.scheduledAt,later+60*60_000);assert.ok(f.calls.some(x=>x.url.includes('/videos?part=status')&&x.method==='PUT'));assert.equal(f.calls.filter(x=>x.url.includes('uploadType=resumable')).length,0);
  assert.equal((await f.adapter.pollStatus({socialAccountId:'a',remoteCorrelationId:'video:video-1'})).processing,true);
  f.setPrivacy('public');assert.equal((await f.adapter.pollStatus({socialAccountId:'a',remoteCorrelationId:'video:video-1'})).externalPostId,'video-1');
});
