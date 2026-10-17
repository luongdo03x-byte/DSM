import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {BatchStatusService} from '../../apps/api/src/modules/publishing/batch-status.service.ts';
import {registeredNodeKey} from '../../apps/api/src/runtime/dev-runtime.ts';
import {CredentialCryptoService} from '../../apps/api/src/modules/accounts/credential-crypto.service.ts';
import {TaskExecutor} from '../../apps/browser-gateway/src/tasks/task-executor.ts';
import {PublisherRegistry} from '../../apps/api/src/modules/publishing/publisher-registry.ts';
import {JobRunner} from '../../apps/worker/src/publishing/job-runner.service.ts';
import {PublishError} from '../../packages/platform-contracts/src/index.ts';
import type {PlatformPublisher} from '../../packages/platform-contracts/src/index.ts';
import {MemoryRepositories} from '../../packages/shared/src/memory-repositories.ts';
import {MemoryStore} from '../../packages/shared/src/store.ts';

function job(id: string) {return {id, batchId: 'batch', brandId: 'brand', socialAccountId: 'account', contentVariantId: 'variant', platform: 'FACEBOOK' as const,
  strategy: 'BROWSER' as const, scheduledAt: 0, status: 'QUEUED' as const, attemptCount: 0, maxAttempts: 4, idempotencyKey: id}}

test('cancel and reschedule lose to an atomic worker claim', async () => {
  for (const operation of ['cancel', 'reschedule'] as const) {
    const repos = new MemoryRepositories(new MemoryStore());
    await repos.publishJobs.insert(job(operation));
    const get = repos.publishJobs.get.bind(repos.publishJobs);
    let raced = false;
    repos.publishJobs.get = async id => {
      const found = await get(id);
      if (!raced) {raced = true; await repos.publishJobs.claim(id, ['QUEUED'], 'PROCESSING')}
      return found;
    };
    const status = new BatchStatusService(repos);
    await assert.rejects(operation === 'cancel' ? status.cancel(operation) : status.reschedule(operation, 5000), /CONFLICT/);
    assert.equal((await get(operation))?.status, 'PROCESSING');
  }
});

test('a stale queue delivery cannot publish a rescheduled future job', async () => {
  const repos = new MemoryRepositories(new MemoryStore());
  await repos.publishJobs.insert({...job('future'), scheduledAt: Date.now() + 60_000});
  const registry = new PublisherRegistry();
  assert.equal(await new JobRunner(repos, registry).run('future', async () => {throw new Error('must not build input')}), 'SKIPPED');
  assert.equal((await repos.publishJobs.get('future'))?.status, 'QUEUED');
});

test('browser gateway submits a correlation only once', async () => {
  const executor = new TaskExecutor();
  let calls = 0;
  executor.register('PUBLISH', async () => {calls++; return {externalPostId: 'post-1'}});
  const input = {type: 'PUBLISH' as const, profileId: 'profile', correlationId: 'job-1'};
  const first = await executor.submit(input);
  const second = await executor.submit(input);
  assert.equal(first.taskId, 'job-1');
  assert.equal(second.taskId, first.taskId);
  assert.equal(calls, 1);
});

test('browser gateway journal survives restart and marks interrupted submission uncertain', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsm-browser-journal-'));
  const file = join(dir, 'tasks.json');
  try {
    const executor = new TaskExecutor(1, file);
    executor.register('PUBLISH', async (_req, ctx) => {ctx.transition('STARTING_PROFILE'); ctx.transition('CONNECTING_BROWSER');
      ctx.transition('NAVIGATING'); ctx.transition('SUBMITTING'); ctx.transition('VERIFYING'); return {externalPostId: 'post-1'}});
    await executor.submit({type: 'PUBLISH', profileId: 'p', correlationId: 'durable'});
    const restarted = new TaskExecutor(1, file);
    assert.equal(restarted.get('durable').result?.externalPostId, 'post-1');
    assert.equal((await restarted.submit({type: 'PUBLISH', profileId: 'p', correlationId: 'durable'})).taskId, 'durable');
    writeFileSync(file, JSON.stringify([{taskId: 'interrupted', state: 'SUBMITTING'}]));
    const recovered = new TaskExecutor(1, file);
    assert.equal(recovered.get('interrupted').error?.code, 'OUTCOME_UNKNOWN');
    assert.equal(recovered.get('interrupted').error?.retryable, false);
    assert.equal(JSON.parse(readFileSync(file, 'utf8'))[0].state, 'FAILED');
    writeFileSync(file, JSON.stringify([{taskId: 'pre-submit', state: 'UPLOADING'}]));
    const safe = new TaskExecutor(1, file);
    assert.equal(safe.get('pre-submit').error?.code, 'GATEWAY_RESTART_PRE_SUBMIT');
    assert.equal(safe.get('pre-submit').error?.retryable, true);
  } finally {rmSync(dir, {recursive: true, force: true})}
});

test('interrupted browser attempt reconciles without submitting twice', async () => {
  const repos = new MemoryRepositories(new MemoryStore());
  await repos.publishJobs.insert(job('browser-job'));
  let publishCalls = 0;
  const publisher: PlatformPublisher = {
    async validate() {return {valid: true, errors: [], warnings: []}},
    async publish(input) {publishCalls++; assert.equal(input.remoteCorrelationId, 'browser-job:1'); throw new PublishError({type: 'NETWORK_ERROR', code: 'RESPONSE_LOST', message: 'lost', retryable: true})},
    async fetchPost(id) {assert.equal(id, 'browser-job:1'); return {exists: true, externalPostId: 'remote-post'}},
    async fetchMetrics() {return {raw: {}}},
  };
  const registry = new PublisherRegistry(); registry.register('FACEBOOK', 'BROWSER', publisher);
  const runner = new JobRunner(repos, registry);
  const input = async (current: {remoteCorrelationId?: string}) => ({brandId: 'brand', socialAccountId: 'account', contentVariantId: 'variant', platform: 'FACEBOOK' as const, contentType: 'TEXT' as const, remoteCorrelationId: current.remoteCorrelationId});
  assert.equal(await runner.run('browser-job', input), 'RETRYING');
  assert.equal((await repos.publishJobs.get('browser-job'))?.remoteCorrelationId, 'browser-job:1');
  await repos.publishJobs.update('browser-job', {scheduledAt: 0});
  assert.equal(await runner.run('browser-job', input), 'PUBLISHED');
  assert.equal(publishCalls, 1);
});

test('definitive browser task failure retries with a new correlation', async () => {
  const repos = new MemoryRepositories(new MemoryStore());
  await repos.publishJobs.insert({...job('safe-retry'), status: 'RETRYING', attemptCount: 1, remoteCorrelationId: 'safe-retry:1'});
  let submitted = '';
  const publisher: PlatformPublisher = {
    async validate() {return {valid: true, errors: [], warnings: []}},
    async publish(input) {submitted = input.remoteCorrelationId ?? ''; return {externalPostId: 'post-2', remoteCorrelationId: submitted}},
    async fetchPost() {throw new PublishError({type: 'BROWSER_ERROR', code: 'TASK_RETRYABLE_FAILURE', message: 'navigation failed', retryable: true})},
    async fetchMetrics() {return {raw: {}}},
  };
  const registry = new PublisherRegistry(); registry.register('FACEBOOK', 'BROWSER', publisher);
  const runner = new JobRunner(repos, registry);
  assert.equal(await runner.run('safe-retry', async current => ({brandId: 'brand', socialAccountId: 'account', contentVariantId: 'variant', platform: 'FACEBOOK', contentType: 'TEXT', remoteCorrelationId: current.remoteCorrelationId})), 'PUBLISHED');
  assert.equal(submitted, 'safe-retry:2');
});

test('gateway lookup outage waits; missing journal entry resubmits the same correlation', async () => {
  const repos = new MemoryRepositories(new MemoryStore());
  await repos.publishJobs.insert({...job('lookup'), status: 'RETRYING', attemptCount: 1, remoteCorrelationId: 'lookup:1'});
  let lookupAvailable = false, publishCalls = 0;
  const publisher: PlatformPublisher = {
    async validate() {return {valid: true, errors: [], warnings: []}},
    async publish(input) {publishCalls++; assert.equal(input.remoteCorrelationId, 'lookup:1'); return {externalPostId: 'post-1'}},
    async fetchPost() {throw Object.assign(new Error(lookupAvailable ? 'TASK_NOT_FOUND' : 'gateway unavailable'),
      {code: lookupAvailable ? 'TASK_NOT_FOUND' : 'BROWSER_GATEWAY_HTTP_503', retryable: !lookupAvailable})},
    async fetchMetrics() {return {raw: {}}},
  };
  const registry = new PublisherRegistry(); registry.register('FACEBOOK', 'BROWSER', publisher);
  const runner = new JobRunner(repos, registry);
  const input = async (current: {remoteCorrelationId?: string}) => ({brandId: 'brand', socialAccountId: 'account', contentVariantId: 'variant', platform: 'FACEBOOK' as const, contentType: 'TEXT' as const, remoteCorrelationId: current.remoteCorrelationId});
  assert.equal(await runner.run('lookup', input), 'RETRYING');
  assert.equal(publishCalls, 0);
  lookupAvailable = true;
  await repos.publishJobs.update('lookup', {scheduledAt: 0});
  assert.equal(await runner.run('lookup', input), 'PUBLISHED');
  assert.equal(publishCalls, 1);
});

test('gateway capacity error remains retryable after the first submission attempt', async () => {
  const repos = new MemoryRepositories(new MemoryStore());
  await repos.publishJobs.insert(job('capacity'));
  const publisher: PlatformPublisher = {
    async validate() {return {valid: true, errors: [], warnings: []}},
    async publish() {throw Object.assign(new Error('capacity exceeded'), {code: 'CAPACITY_EXCEEDED', retryable: true})},
    async fetchPost() {return {exists: false, externalPostId: ''}},
    async fetchMetrics() {return {raw: {}}},
  };
  const registry = new PublisherRegistry(); registry.register('FACEBOOK', 'BROWSER', publisher);
  const runner = new JobRunner(repos, registry);
  assert.equal(await runner.run('capacity', async current => ({brandId: 'brand', socialAccountId: 'account', contentVariantId: 'variant', platform: 'FACEBOOK', contentType: 'TEXT', remoteCorrelationId: current.remoteCorrelationId})), 'RETRYING');
  assert.equal((await repos.publishJobs.get('capacity'))?.errorCode, 'CAPACITY_EXCEEDED');
});

test('registered gateway key is decrypted per node', async () => {
  const repos = new MemoryRepositories(new MemoryStore());
  const crypto = new CredentialCryptoService(new Uint8Array(32).fill(7));
  await repos.browserNodes.insert({id: 'node-1', workspaceId: 'workspace', name: 'Node', host: '127.0.0.1', port: 4010, status: 'ONLINE', provider: 'GPMLOGIN', maxConcurrency: 2,
    encryptedNodeKey: JSON.stringify(await crypto.encrypt('unique-node-key', 'browser-node:node-1'))});
  assert.equal(await registeredNodeKey(repos, crypto)('node-1'), 'unique-node-key');
  await assert.rejects(registeredNodeKey(repos, crypto)('missing'), /NODE_KEY_NOT_REGISTERED/);
});
