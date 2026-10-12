import test from 'node:test';
import assert from 'node:assert/strict';
import {platformLabel,statusLabel} from '../../apps/web/src/lib/ui/status.ts';

test('job statuses are localized',()=>{
  assert.equal(statusLabel('PUBLISHED'),'Đã đăng');
  assert.equal(statusLabel('PROCESSING'),'Đang xử lý');
  assert.equal(statusLabel('RETRYING'),'Đang thử lại');
  assert.equal(statusLabel('FAILED'),'Thất bại');
  assert.equal(statusLabel('QUEUED'),'Đang chờ');
  assert.equal(statusLabel('CANCELLED'),'Đã hủy');
});
test('platform names remain canonical',()=>{
  assert.deepEqual(['FACEBOOK','INSTAGRAM','THREADS','TIKTOK'].map(platformLabel),['Facebook','Instagram','Threads','TikTok']);
});
