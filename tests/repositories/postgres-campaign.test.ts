import test from 'node:test';
import assert from 'node:assert/strict';
import {createPrismaClient} from '../../packages/database/src/client.ts';
import {PrismaRepositories} from '../../packages/database/src/prisma-repositories.ts';

const databaseUrl = process.env.DATABASE_URL_TEST;
if (!databaseUrl) throw new Error('DATABASE_URL_TEST is required (docker compose up -d postgres)');

test('postgres campaign creates and updates content links', async () => {
  const client = createPrismaClient(databaseUrl);
  const repos = new PrismaRepositories(client);
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const workspaceId = `w-${suffix}`, brandId = `b-${suffix}`, contentId = `c-${suffix}`, campaignId = `cmp-${suffix}`;
  try {
    await repos.workspaces.insert({id: workspaceId, name: 'Workspace'});
    await repos.brands.insert({id: brandId, workspaceId, name: 'Brand', slug: brandId, language: 'vi', timezone: 'UTC', currency: 'USD', status: 'ACTIVE'});
    await repos.contents.insert({id: contentId, brandId, type: 'TEXT', title: 'Content', status: 'READY'});
    const created = await repos.campaigns.insert({id: campaignId, brandId, name: 'Campaign', status: 'DRAFT', contentIds: []});
    assert.deepEqual(created.contentIds, []);
    const updated = await repos.campaigns.update(campaignId, {contentIds: [contentId]});
    assert.deepEqual(updated.contentIds, [contentId]);
    assert.deepEqual((await repos.campaigns.get(campaignId))?.contentIds, [contentId]);
  } finally {
    await repos.campaigns.remove(campaignId);
    await repos.contents.remove(contentId);
    await repos.brands.remove(brandId);
    await repos.workspaces.remove(workspaceId);
    await client.$disconnect();
  }
});
