import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {Queue} from 'bullmq';
import IORedis from 'ioredis';
import {createPrismaClient} from '../../packages/database/src/client.ts';
import {PrismaRepositories} from '../../packages/database/src/prisma-repositories.ts';
import {BullJobQueue} from '../../apps/worker/src/queue/bull-job-queue.ts';
import {startWorker} from '../../apps/worker/src/main.ts';
import {PublisherRegistry} from '../../apps/api/src/modules/publishing/publisher-registry.ts';
import {FakePublisher} from '../../apps/worker/src/testing/fake-publisher.ts';

const databaseUrl = process.env.DATABASE_URL_TEST;
const redisUrl = process.env.REDIS_URL_TEST;
if (!databaseUrl) throw new Error('DATABASE_URL_TEST is required (docker compose up -d postgres)');
if (!redisUrl) throw new Error('REDIS_URL_TEST is required (docker compose up -d redis)');

async function until(check: () => Promise<boolean>, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.fail('Timed out waiting for worker to publish');
}

async function fixture(t: import('node:test').TestContext, count: number, delayMs: number) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const queueName = `dsm-worker-test-${suffix}`;
  const client = createPrismaClient(databaseUrl!);
  const repos = new PrismaRepositories(client);
  const queue = new BullJobQueue({url: redisUrl!}, queueName);
  const connection = new IORedis(redisUrl!, {maxRetriesPerRequest: null});
  const rawQueue = new Queue(queueName, {connection});
  const publisher = new FakePublisher();
  const registry = new PublisherRegistry();
  registry.register('FACEBOOK', 'API', publisher);
  const env = {DATABASE_URL: databaseUrl, REDIS_URL: redisUrl, PUBLISH_QUEUE_NAME: queueName, WORKER_CONCURRENCY: '2',
    CREDENTIAL_ENCRYPTION_KEY: randomBytes(32).toString('base64')};
  const ids = {workspace: `w-${suffix}`, brand: `b-${suffix}`, content: `c-${suffix}`, variant: `v-${suffix}`,
    account: `a-${suffix}`, batch: `batch-${suffix}`};
  const jobIds = Array.from({length: count}, (_, i) => `job-${suffix}-${i}`);
  await repos.workspaces.insert({id: ids.workspace, name: 'Test workspace'});
  await repos.brands.insert({id: ids.brand, workspaceId: ids.workspace, name: 'Brand', slug: `brand-${suffix}`, language: 'vi', timezone: 'Asia/Bangkok', currency: 'VND', status: 'ACTIVE'});
  await repos.contents.insert({id: ids.content, brandId: ids.brand, type: 'TEXT', title: 'Post', body: 'Hello', status: 'READY'});
  await repos.variants.insert({id: ids.variant, contentItemId: ids.content, platform: 'FACEBOOK', body: 'Hello', hashtags: [], status: 'READY'});
  await repos.socialAccounts.insert({id: ids.account, brandId: ids.brand, platform: 'FACEBOOK', publishMode: 'API', status: 'CONNECTED'});
  await repos.publishBatches.insert({id: ids.batch, brandId: ids.brand, contentItemId: ids.content, createdBy: 'owner', createdAt: Date.now()});
  for (const [i, id] of jobIds.entries()) {
    const scheduledAt = Date.now() + delayMs;
    await repos.publishJobs.insert({id, batchId: ids.batch, brandId: ids.brand, socialAccountId: ids.account,
      contentVariantId: ids.variant, platform: 'FACEBOOK', strategy: 'API', scheduledAt, status: 'QUEUED',
      attemptCount: 0, maxAttempts: 4, idempotencyKey: `worker-${suffix}-${i}`});
    await queue.schedule(id, scheduledAt);
  }
  t.after(async () => {
    await rawQueue.obliterate({force: true});
    await rawQueue.close();
    connection.disconnect();
    await queue.close();
    for (const id of jobIds) {
      for (const post of await repos.publishedPosts.findBy({publishJobId: id})) await repos.publishedPosts.remove(post.id);
      await repos.publishJobs.remove(id);
    }
    await repos.publishBatches.remove(ids.batch);
    await repos.socialAccounts.remove(ids.account);
    await repos.variants.remove(ids.variant);
    await repos.contents.remove(ids.content);
    await repos.brands.remove(ids.brand);
    await repos.workspaces.remove(ids.workspace);
    await client.$disconnect();
  });
  return {repos, queue, rawQueue, publisher, registry, env, jobIds};
}

test('restart worker does not lose scheduled job', {timeout: 15000}, async t => {
  const f = await fixture(t, 1, 1500);
  const first = await startWorker({env: f.env, registry: f.registry});
  await new Promise(resolve => setTimeout(resolve, 300));
  await first.close();
  await f.rawQueue.obliterate({force: true});
  const restarted = await startWorker({env: f.env, registry: f.registry});
  try {
    await until(async () => (await f.repos.publishJobs.get(f.jobIds[0]!))?.status === 'PUBLISHED');
    assert.equal(f.publisher.publishCalls, 1);
  } finally {await restarted.close()}
});

test('two workers publish five due jobs only once each', {timeout: 15000}, async t => {
  const f = await fixture(t, 5, 200);
  const workers = await Promise.all([startWorker({env: f.env, registry: f.registry}), startWorker({env: f.env, registry: f.registry})]);
  try {
    await until(async () => (await Promise.all(f.jobIds.map(id => f.repos.publishJobs.get(id)))).every(job => job?.status === 'PUBLISHED'));
    assert.equal(f.publisher.publishCalls, 5);
    for (const id of f.jobIds) assert.equal((await f.repos.publishedPosts.findBy({publishJobId: id})).length, 1);
  } finally {await Promise.all(workers.map(worker => worker.close()))}
});
