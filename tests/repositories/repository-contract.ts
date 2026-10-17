import assert from 'node:assert/strict';
import {test} from 'node:test';
import type {Brand, ContentItem, ContentVariant, Product, PublishBatch, PublishJob, SocialAccount, Workspace} from '../../packages/shared/src/domain.ts';
import type {Repositories} from '../../packages/shared/src/repositories.ts';

type Fixture = {repos: Repositories; reset(): Promise<void>; close(): Promise<void>};

const workspace: Workspace = {id: 'workspace-contract', name: 'Contract workspace'};
const brand: Brand = {id: 'brand-contract', workspaceId: workspace.id, name: 'Contract brand', slug: 'contract', language: 'vi', timezone: 'Asia/Bangkok', currency: 'VND', status: 'ACTIVE'};
const product: Product = {id: 'product-contract', brandId: brand.id, name: 'Product', slug: 'product', description: 'A product', imageAssetId: 'image-1', supplierUrl: 'https://supplier.test/p', landingUrl: 'https://shop.test/p', cost: '8', sellingPrice: '29', currency: 'VND', status: 'ACTIVE'};
const content: ContentItem = {id: 'content-contract', brandId: brand.id, type: 'TEXT', title: 'Post', body: 'Hello', status: 'READY'};
const account: SocialAccount = {id: 'account-contract', brandId: brand.id, platform: 'FACEBOOK', publishMode: 'API', status: 'CONNECTED'};
const batch: PublishBatch = {id: 'batch-contract', brandId: brand.id, contentItemId: content.id, createdBy: 'owner', createdAt: 1_700_000_000_000};
const variant: ContentVariant = {id: 'variant-contract', contentItemId: content.id, platform: 'FACEBOOK', hashtags: ['hello'], status: 'READY'};

async function seedBase(repos: Repositories) {
  await repos.workspaces.insert(workspace);
  await repos.brands.insert(brand);
}

async function seedPublishing(repos: Repositories) {
  await seedBase(repos);
  await repos.contents.insert(content);
  await repos.socialAccounts.insert(account);
  await repos.variants.insert(variant);
  await repos.publishBatches.insert(batch);
}

function job(id: string, scheduledAt: number, status: PublishJob['status']): PublishJob {
  return {id, batchId: batch.id, brandId: brand.id, socialAccountId: account.id, contentVariantId: variant.id, platform: 'FACEBOOK', strategy: 'API', scheduledAt, status, attemptCount: 0, maxAttempts: 4, idempotencyKey: id};
}

export function runRepositoryContract(name: string, make: () => Promise<Fixture>): void {
  function check(label: string, body: (repos: Repositories) => Promise<void>) {
    test(`${name}: ${label}`, async () => {
      const fixture = await make();
      try {
        await fixture.reset();
        await body(fixture.repos);
      } finally {
        await fixture.close();
      }
    });
  }

  check('insert rồi get trả đúng bản ghi', async repos => {
    await seedBase(repos);
    assert.deepEqual(await repos.products.insert(product), product);
    assert.deepEqual(await repos.products.get(product.id), product);
  });

  check('insert trùng id ném DUPLICATE_ID', async repos => {
    await seedBase(repos);
    await repos.products.insert(product);
    await assert.rejects(repos.products.insert(product), {message: 'DUPLICATE_ID'});
  });

  check('update gộp patch và id thiếu ném NOT_FOUND', async repos => {
    await seedBase(repos);
    await repos.products.insert(product);
    assert.deepEqual(await repos.products.update(product.id, {name: 'Renamed'}), {...product, name: 'Renamed'});
    await assert.rejects(repos.products.update('absent', {name: 'Missing'}), {message: 'NOT_FOUND'});
  });

  check('findBy lọc theo nhiều trường', async repos => {
    await seedBase(repos);
    await repos.contents.insert(content);
    await repos.variants.insert(variant);
    await repos.variants.insert({...variant, id: 'variant-threads', platform: 'THREADS'});
    await repos.variants.insert({...variant, id: 'variant-other', contentItemId: content.id, platform: 'FACEBOOK', status: 'DRAFT'});
    assert.deepEqual((await repos.variants.findBy({contentItemId: content.id, platform: 'THREADS'})).map(v => v.id), ['variant-threads']);
  });

  check('findDue lọc status và giờ, sắp tăng dần, tôn trọng limit', async repos => {
    await seedPublishing(repos);
    for (const row of [
      job('late', 300, 'QUEUED'),
      job('early', 100, 'QUEUED'),
      job('retry', 200, 'RETRYING'),
      job('future', 500, 'QUEUED'),
      job('published', 50, 'PUBLISHED'),
    ]) await repos.publishJobs.insert(row);
    assert.deepEqual((await repos.publishJobs.findDue(300, 2)).map(row => row.id), ['early', 'retry']);
  });

  check('claim chỉ một lần thắng khi gọi song song', async repos => {
    await seedPublishing(repos);
    await repos.publishJobs.insert(job('claimable', 100, 'QUEUED'));
    const wins = await Promise.all(Array.from({length: 10}, () => repos.publishJobs.claim('claimable', ['QUEUED'], 'PROCESSING')));
    assert.equal(wins.filter(Boolean).length, 1);
    assert.equal((await repos.publishJobs.get('claimable'))?.status, 'PROCESSING');
  });

  check('claim cập nhật trạng thái và lịch nguyên tử, chỉ nhận việc đến hạn', async repos => {
    await seedPublishing(repos);
    await repos.publishJobs.insert(job('rescheduled', 100, 'QUEUED'));
    assert.equal(await repos.publishJobs.claim('rescheduled', ['QUEUED'], 'QUEUED', {patch: {scheduledAt: 500}}), true);
    assert.equal(await repos.publishJobs.claim('rescheduled', ['QUEUED'], 'PROCESSING', {dueAt: 100}), false);
    assert.equal((await repos.publishJobs.get('rescheduled'))?.scheduledAt, 500);
    assert.equal(await repos.publishJobs.claim('rescheduled', ['QUEUED'], 'PROCESSING', {dueAt: 500}), true);
  });

  check('transaction rollback khi fn ném', async repos => {
    await seedBase(repos);
    await assert.rejects(repos.transaction(async tx => {
      await tx.products.insert(product);
      throw new Error('ROLLBACK');
    }), {message: 'ROLLBACK'});
    assert.equal(await repos.products.get(product.id), undefined);
  });
}
