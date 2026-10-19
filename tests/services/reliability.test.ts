import test from 'node:test';
import assert from 'node:assert/strict';
import {MemoryStore} from '../../packages/shared/src/store.ts';
import {MemoryRepositories} from '../../packages/shared/src/memory-repositories.ts';
import {ReliabilityService} from '../../apps/api/src/modules/analytics/reliability.service.ts';

test('reliability excludes user validation errors from success rate',async()=>{
  const repos=new MemoryRepositories(new MemoryStore()),since=Date.UTC(2026,9,1);
  for(let index=0;index<8;index++)await repos.publishedPosts.insert({id:`post-${index}`,brandId:'brand-1',publishJobId:`job-${index}`,socialAccountId:'account-1',contentVariantId:'variant-1',platform:'FACEBOOK',platformPostId:`remote-${index}`,publishedAt:since+1000});
  for(const [id,errorCode] of [['failed-platform','RATE_LIMIT'],['failed-user','VALIDATION_ERROR']] as const)await repos.publishJobs.insert({id,batchId:'batch-1',brandId:'brand-1',socialAccountId:'account-1',contentVariantId:'variant-1',platform:'FACEBOOK',strategy:'API',scheduledAt:since+2000,status:'FAILED',attemptCount:1,maxAttempts:1,idempotencyKey:id,errorCode});
  const summary=await new ReliabilityService(repos).summary('brand-1',since);
  assert.deepEqual(summary,{published:8,failedPlatform:1,failedUser:1,successRate:8/9});
});
test('reliability returns null without completed platform outcomes',async()=>{
  const repos=new MemoryRepositories(new MemoryStore());
  assert.deepEqual(await new ReliabilityService(repos).summary('brand-1',0),{published:0,failedPlatform:0,failedUser:0,successRate:null});
});
test('reliability counts a failure when its final attempt finishes inside the window',async()=>{
  const repos=new MemoryRepositories(new MemoryStore()),since=Date.UTC(2026,9,1);
  await repos.publishJobs.insert({id:'late-failure',batchId:'batch-1',brandId:'brand-1',socialAccountId:'account-1',contentVariantId:'variant-1',platform:'FACEBOOK',strategy:'API',scheduledAt:since-3_600_000,status:'FAILED',attemptCount:1,maxAttempts:1,idempotencyKey:'late-failure',errorCode:'RATE_LIMIT'});
  await repos.publishAttempts.append({id:'attempt-1',publishJobId:'late-failure',attemptNumber:1,strategy:'API',startedAt:since-1000,finishedAt:since+1000,status:'FAILED',errorType:'RATE_LIMIT'});
  assert.deepEqual(await new ReliabilityService(repos).summary('brand-1',since),{published:0,failedPlatform:1,failedUser:0,successRate:0});
});
