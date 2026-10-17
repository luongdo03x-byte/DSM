import assert from 'node:assert/strict';
import {test} from 'node:test';
import {JobRunner} from '../../apps/worker/src/publishing/job-runner.service.ts';
import {FakePublisher} from '../../apps/worker/src/testing/fake-publisher.ts';
import {PublisherRegistry} from '../../apps/api/src/modules/publishing/publisher-registry.ts';
import {MemoryRepositories} from '../../packages/shared/src/memory-repositories.ts';
import {MemoryStore} from '../../packages/shared/src/store.ts';
import {PublishError} from '../../packages/platform-contracts/src/index.ts';
import type {PublishInput} from '../../packages/platform-contracts/src/index.ts';

test('chạy song song hai lần cùng job chỉ gọi publisher một lần', async () => {
  const repos = new MemoryRepositories(new MemoryStore());
  await repos.workspaces.insert({id: 'w', name: 'Workspace'});
  await repos.brands.insert({id: 'b', workspaceId: 'w', name: 'Brand', slug: 'brand', language: 'vi', timezone: 'Asia/Bangkok', currency: 'VND', status: 'ACTIVE'});
  await repos.contents.insert({id: 'c', brandId: 'b', type: 'TEXT', title: 'Post', body: 'Hello', status: 'READY'});
  await repos.variants.insert({id: 'v', contentItemId: 'c', platform: 'FACEBOOK', hashtags: [], status: 'READY'});
  await repos.socialAccounts.insert({id: 'a', brandId: 'b', platform: 'FACEBOOK', publishMode: 'API', status: 'CONNECTED'});
  await repos.publishBatches.insert({id: 'batch', brandId: 'b', contentItemId: 'c', createdBy: 'owner', createdAt: 100});
  await repos.publishJobs.insert({id: 'job', batchId: 'batch', brandId: 'b', socialAccountId: 'a', contentVariantId: 'v', platform: 'FACEBOOK', strategy: 'API', scheduledAt: 100, status: 'QUEUED', attemptCount: 0, maxAttempts: 4, idempotencyKey: 'once'});
  const publisher = new FakePublisher();
  const registry = new PublisherRegistry();
  registry.register('FACEBOOK', 'API', publisher);
  const runner = new JobRunner(repos, registry);
  const build = async () => ({brandId: 'b', socialAccountId: 'a', contentVariantId: 'v', platform: 'FACEBOOK' as const, contentType: 'TEXT' as const, body: 'Hello'});
  const results = await Promise.all([runner.run('job', build), runner.run('job', build)]);
  assert.deepEqual(results.sort(), ['PUBLISHED', 'SKIPPED']);
  assert.equal(publisher.publishCalls, 1);
  assert.equal((await repos.publishedPosts.findBy({publishJobId: 'job'})).length, 1);
});

test('API retry supplies first attempt time for remote duplicate reconciliation',async()=>{
  const repos=new MemoryRepositories(new MemoryStore());
  await repos.publishJobs.insert({id:'job',batchId:'batch',brandId:'b',socialAccountId:'a',contentVariantId:'v',platform:'FACEBOOK',strategy:'API',scheduledAt:1,status:'QUEUED',attemptCount:0,maxAttempts:3,idempotencyKey:'retry'});
  const seen:PublishInput[]=[];const publisher=new FakePublisher();publisher.publish=async input=>{seen.push(input);if(seen.length===1)throw new PublishError({type:'NETWORK_ERROR',code:'NETWORK',message:'timeout',retryable:true});return {externalPostId:'post-1'}};
  const registry=new PublisherRegistry();registry.register('FACEBOOK','API',publisher);const runner=new JobRunner(repos,registry);
  const build=async()=>({brandId:'b',socialAccountId:'a',contentVariantId:'v',platform:'FACEBOOK' as const,contentType:'TEXT' as const,body:'Hello'});
  assert.equal(await runner.run('job',build),'RETRYING');
  const first=(await repos.publishAttempts.findBy({publishJobId:'job'}))[0]!;
  await repos.publishJobs.update('job',{scheduledAt:1});
  assert.equal(await runner.run('job',build),'PUBLISHED');
  assert.equal(seen[1]?.metadata?.retrySince,Math.floor(first.startedAt/1000));
});
