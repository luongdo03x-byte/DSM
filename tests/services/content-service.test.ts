import assert from 'node:assert/strict';
import {test} from 'node:test';
import {ContentService} from '../../apps/api/src/modules/content/content.service.ts';
import {MemoryRepositories} from '../../packages/shared/src/memory-repositories.ts';
import {MemoryStore} from '../../packages/shared/src/store.ts';

test('copyMasterToAll tạo đúng một biến thể mỗi nền tảng và gọi lần hai không tạo trùng', async () => {
  const repos = new MemoryRepositories(new MemoryStore());
  await repos.workspaces.insert({id: 'workspace-1', name: 'Workspace'});
  await repos.brands.insert({id: 'brand-1', workspaceId: 'workspace-1', name: 'Brand', slug: 'brand', language: 'vi', timezone: 'Asia/Bangkok', currency: 'VND', status: 'ACTIVE'});
  await repos.contents.insert({id: 'content-1', brandId: 'brand-1', type: 'TEXT', title: 'Master', body: 'Hello', status: 'DRAFT'});
  const service = new ContentService(repos);
  const first = await service.copyMasterToAll('brand-1', 'content-1');
  const second = await service.copyMasterToAll('brand-1', 'content-1');
  assert.deepEqual(first.map(v => v.platform), ['FACEBOOK', 'INSTAGRAM', 'THREADS', 'TIKTOK', 'YOUTUBE']);
  assert.deepEqual(second.map(v => v.id), first.map(v => v.id));
  assert.equal((await repos.variants.findBy({contentItemId: 'content-1'})).length, 5);
});
