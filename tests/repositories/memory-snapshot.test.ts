import assert from 'node:assert/strict';
import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test} from 'node:test';
import {JsonStorePersistence} from '../../apps/api/src/runtime/json-store-persistence.ts';
import {MemoryRepositories} from '../../packages/shared/src/memory-repositories.ts';

test('memory repositories nạp snapshot cũ', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsm-sp2-snapshot-'));
  try {
    const file = join(dir, 'store.json');
    const brand = {id: 'brand-old', workspaceId: 'workspace-old', name: 'Old', slug: 'old', language: 'vi', timezone: 'Asia/Bangkok', currency: 'VND', status: 'ACTIVE'};
    const product = {id: 'product-old', brandId: 'brand-old', name: 'Old product', slug: 'old-product', currency: 'VND', status: 'ACTIVE'};
    const credential = {id: 'credential-old', socialAccountId: 'account-old', provider: 'META', ciphertext: 'encrypted-old-token', iv: 'iv', authTag: 'tag'};
    await writeFile(file, JSON.stringify({version: 1, maps: {brands: [[brand.id, brand]], products: [[product.id, product]], credentials: [[credential.id, credential]]}, arrays: {}}));
    const repos = new MemoryRepositories(await new JsonStorePersistence(file).load());
    assert.deepEqual(await repos.products.findBy({brandId: 'brand-old'}), [product]);
    assert.equal((await repos.credentials.get('credential-old'))?.ciphertext, 'encrypted-old-token');
  } finally {
    await rm(dir, {recursive: true, force: true});
  }
});
