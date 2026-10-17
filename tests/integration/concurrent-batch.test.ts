import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createPrismaClient} from '../../packages/database/src/client.ts';
import {PrismaRepositories} from '../../packages/database/src/prisma-repositories.ts';
import {PublishingService} from '../../apps/api/src/modules/publishing/publishing.service.ts';
import {PublisherRegistry} from '../../apps/api/src/modules/publishing/publisher-registry.ts';
import {StrategyResolver} from '../../apps/api/src/modules/publishing/strategy-resolver.ts';
import {FakePublisher} from '../../apps/worker/src/testing/fake-publisher.ts';

const databaseUrl = process.env.DATABASE_URL_TEST;
if (!databaseUrl || !new URL(databaseUrl).pathname.endsWith('_test')) throw new Error('DATABASE_URL_TEST must point to a _test database');

test('concurrent identical publish requests return the same populated batch', async () => {
  const client = createPrismaClient(databaseUrl);
  const repos = new PrismaRepositories(client);
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const w = `w-${suffix}`, b = `b-${suffix}`, c = `c-${suffix}`, v = `v-${suffix}`, a = `a-${suffix}`;
  try {
    await repos.workspaces.insert({id: w, name: 'Workspace'});
    await repos.brands.insert({id: b, workspaceId: w, name: 'Brand', slug: b, language: 'vi', timezone: 'UTC', currency: 'USD', status: 'ACTIVE'});
    await repos.contents.insert({id: c, brandId: b, type: 'TEXT', title: 'Post', body: 'Hello', status: 'READY'});
    await repos.variants.insert({id: v, contentItemId: c, platform: 'FACEBOOK', hashtags: [], status: 'READY'});
    await repos.socialAccounts.insert({id: a, brandId: b, platform: 'FACEBOOK', publishMode: 'API', status: 'CONNECTED'});
    const registry = new PublisherRegistry(); registry.register('FACEBOOK', 'API', new FakePublisher());
    const publishing = new PublishingService(repos, registry, new StrategyResolver());
    const request = {brandId: b, contentId: c, createdBy: 'owner', socialAccountIds: [a], scheduledAt: Date.now() + 60_000};
    const [first, second] = await Promise.all([publishing.createBatch(request), publishing.createBatch(request)]);
    assert.equal(first.batchId, second.batchId);
    assert.equal(first.results[0]?.jobId, second.results[0]?.jobId);
    assert.equal((await repos.publishBatches.findBy({brandId: b})).length, 1);
    assert.equal((await repos.publishJobs.findBy({brandId: b})).length, 1);
  } finally {
    for (const row of await repos.publishJobs.findBy({brandId: b})) await repos.publishJobs.remove(row.id);
    for (const row of await repos.publishBatches.findBy({brandId: b})) await repos.publishBatches.remove(row.id);
    await repos.socialAccounts.remove(a); await repos.variants.remove(v); await repos.contents.remove(c);
    await repos.brands.remove(b); await repos.workspaces.remove(w); await client.$disconnect();
  }
});
