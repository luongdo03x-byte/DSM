import test from 'node:test';
import assert from 'node:assert/strict';
import {RecoveryService, STALE_PROCESSING_MS} from '../../apps/worker/src/maintenance/recovery.service.ts';
import {MemoryRepositories} from '../../packages/shared/src/memory-repositories.ts';
import {MemoryStore} from '../../packages/shared/src/store.ts';
import {InMemoryJobQueue} from '../../packages/shared/src/job-queue.ts';

test('recovery retries stale processing jobs and leaves recent processing alone', async () => {
  const repos = new MemoryRepositories(new MemoryStore());
  const now = Date.now();
  const base = {batchId: 'batch', brandId: 'brand', socialAccountId: 'account', contentVariantId: 'variant',
    platform: 'FACEBOOK' as const, strategy: 'API' as const, scheduledAt: now - STALE_PROCESSING_MS - 1000,
    attemptCount: 1, maxAttempts: 4};
  await repos.publishJobs.insert({...base, id: 'stale', status: 'PROCESSING', processingStartedAt: now - STALE_PROCESSING_MS - 1, idempotencyKey: 'stale'});
  await repos.publishJobs.insert({...base, id: 'recent', status: 'PROCESSING', processingStartedAt: now - 1000, idempotencyKey: 'recent'});
  const delivered: string[] = [];
  const queue = new InMemoryJobQueue(async id => {delivered.push(id)}, () => now);
  const recovered = await new RecoveryService(repos).requeueMissing(queue, now);
  assert.equal(recovered, 1);
  assert.equal((await repos.publishJobs.get('stale'))?.status, 'RETRYING');
  assert.equal((await repos.publishJobs.get('recent'))?.status, 'PROCESSING');
  await queue.tick();
  assert.deepEqual(delivered, ['stale']);
});
