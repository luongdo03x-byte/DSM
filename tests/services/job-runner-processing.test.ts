import test from 'node:test';
import assert from 'node:assert/strict';
import {JobRunner,POLL_INTERVALS_MS} from '../../apps/worker/src/publishing/job-runner.service.ts';
import {RecoveryService,STALE_PROCESSING_MS} from '../../apps/worker/src/maintenance/recovery.service.ts';
import {PublisherRegistry} from '../../apps/api/src/modules/publishing/publisher-registry.ts';
import {FakePublisher} from '../../apps/worker/src/testing/fake-publisher.ts';
import {MemoryRepositories} from '../../packages/shared/src/memory-repositories.ts';
import {MemoryStore} from '../../packages/shared/src/store.ts';
import type {JobQueue} from '../../packages/shared/src/job-queue.ts';

function setup(now:number){
  const repos=new MemoryRepositories(new MemoryStore()),scheduled:Array<{jobId:string;runAt:number}>=[];
  const queue:JobQueue={schedule:async()=>{},reschedule:async()=>{},schedulePoll:async(jobId,runAt)=>{scheduled.push({jobId,runAt})},cancel:async()=>{},close:async()=>{}};
  const registry=new PublisherRegistry(),publisher=new FakePublisher();registry.register('INSTAGRAM','API',publisher);
  return{repos,scheduled,queue,registry,publisher};
}
const build=async()=>({brandId:'b',socialAccountId:'a',contentVariantId:'v',platform:'INSTAGRAM' as const,contentType:'VIDEO' as const});
function job(now:number){return{id:'job',batchId:'batch',brandId:'b',socialAccountId:'a',contentVariantId:'v',platform:'INSTAGRAM' as const,strategy:'API' as const,scheduledAt:now-1,status:'QUEUED' as const,attemptCount:0,maxAttempts:4,idempotencyKey:'processing'}}

test('processing job polls with increasing intervals and publishes only when finished',async()=>{
  let now=1_000_000;const {repos,scheduled,queue,registry,publisher}=setup(now);
  await repos.publishJobs.insert(job(now));
  publisher.publish=async()=>({remoteCorrelationId:'container',processing:true});
  let polls=0;(publisher as any).pollStatus=async()=>++polls<3?{remoteCorrelationId:'container',processing:true}:{externalPostId:'post-1',remoteCorrelationId:'container'};
  const runner=new JobRunner(repos,registry,undefined,queue,()=>now);
  assert.equal(await runner.run('job',build),'PROCESSING');
  assert.equal((await repos.publishJobs.get('job'))?.status,'PROCESSING');
  assert.deepEqual(scheduled,[{jobId:'job',runAt:now+POLL_INTERVALS_MS[0]!}]);
  now+=5_000;assert.equal(await runner.poll('job'),'PROCESSING');
  assert.equal(scheduled[1]?.runAt,now+POLL_INTERVALS_MS[1]!);
  now+=10_000;assert.equal(await runner.poll('job'),'PROCESSING');
  assert.equal(scheduled[2]?.runAt,now+POLL_INTERVALS_MS[2]!);
  now+=20_000;assert.equal(await runner.poll('job'),'PUBLISHED');
  assert.equal((await repos.publishJobs.get('job'))?.status,'PUBLISHED');
  assert.equal((await repos.publishedPosts.findBy({publishJobId:'job'}))[0]?.platformPostId,'post-1');
});

test('processing poll times out after container deadline',async()=>{
  let now=1_000_000;const {repos,queue,registry,publisher}=setup(now);await repos.publishJobs.insert({...job(now),status:'PROCESSING',remoteCorrelationId:'container',processingStartedAt:now-10*60_000-1});
  (publisher as any).pollStatus=async()=>({processing:true,remoteCorrelationId:'container'});
  const runner=new JobRunner(repos,registry,undefined,queue,()=>now);
  assert.equal(await runner.poll('job'),'FAILED');
  assert.equal((await repos.publishJobs.get('job'))?.errorCode,'PROCESSING_TIMEOUT');
});

test('recovery schedules a poll for stale remote processing instead of republishing',async()=>{
  const now=1_000_000,{repos,queue,scheduled}=setup(now);
  await repos.publishJobs.insert({...job(now),status:'PROCESSING',remoteCorrelationId:'container',processingStartedAt:now-STALE_PROCESSING_MS-1});
  assert.equal(await new RecoveryService(repos).requeueMissing(queue,now),1);
  assert.equal((await repos.publishJobs.get('job'))?.status,'PROCESSING');
  assert.deepEqual(scheduled,[{jobId:'job',runAt:now}]);
});

test('overlapping polls do not publish twice or overwrite a completed job',async()=>{
  const now=1_000_000,{repos,queue,registry,publisher}=setup(now);
  await repos.publishJobs.insert({...job(now),status:'PROCESSING',remoteCorrelationId:'container',processingStartedAt:now-1});
  let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve});
  let calls=0;(publisher as any).pollStatus=async()=>{calls++;if(calls===1){await gate;return{externalPostId:'post-1',remoteCorrelationId:'container'}}throw new Error('container already used')};
  const runner=new JobRunner(repos,registry,undefined,queue,()=>now);
  const first=runner.poll('job');
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(await runner.poll('job'),'PROCESSING');
  release();assert.equal(await first,'PUBLISHED');
  assert.equal(calls,1);
  assert.equal((await repos.publishJobs.get('job'))?.status,'PUBLISHED');
  assert.equal((await repos.publishedPosts.findBy({publishJobId:'job'})).length,1);
});
