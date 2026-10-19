import test from 'node:test';
import assert from 'node:assert/strict';
import {canDrag,moveToDate,groupByDay,filterEntries} from '../../apps/web/src/features/calendar/calendar-board-model.ts';
import type {CalendarEntry} from '../../apps/api/src/modules/publishing/publishing.service.ts';

const entry:CalendarEntry={jobId:'job-1',contentItemId:'content-1',title:'Bài mẫu',platform:'FACEBOOK',socialAccountId:'account-1',scheduledAt:Date.UTC(2026,9,18,13,30),status:'QUEUED'};

test('job PUBLISHED không kéo được',()=>{
  assert.equal(canDrag({...entry,status:'PUBLISHED'}),false);
  assert.equal(canDrag(entry),true);
  assert.equal(canDrag({...entry,status:'RETRYING'}),true);
});
test('moveToDate giữ 20:30 khi đổi ngày theo múi giờ brand',()=>{
  assert.equal(moveToDate(entry,'2026-10-20','Asia/Ho_Chi_Minh'),Date.UTC(2026,9,20,13,30));
});
test('groupByDay theo múi giờ brand',()=>{
  const late={...entry,scheduledAt:Date.UTC(2026,9,18,23,30)};
  assert.deepEqual(Object.keys(groupByDay([late],'Asia/Ho_Chi_Minh')),['2026-10-19']);
});
test('filterEntries combines platform and status',()=>{
  assert.deepEqual(filterEntries([entry,{...entry,jobId:'job-2',platform:'INSTAGRAM'}],{platforms:['FACEBOOK'],statuses:['QUEUED']}),[entry]);
});
