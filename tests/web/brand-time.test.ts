import test from 'node:test';
import assert from 'node:assert/strict';
import {toUtcMs,fromUtcMs,monthGrid} from '../../apps/web/src/lib/ui/brand-time.ts';

test('giờ nhập theo Asia/Ho_Chi_Minh lưu đúng UTC',()=>{
  assert.equal(toUtcMs('2026-10-18','20:30','Asia/Ho_Chi_Minh'),Date.UTC(2026,9,18,13,30));
});

test('UTC round-trip displays the brand local time and zone',()=>{
  assert.deepEqual(fromUtcMs(Date.UTC(2026,9,18,13,30),'Asia/Ho_Chi_Minh'),{date:'2026-10-18',time:'20:30',label:'20:30, 18/10/2026 (GMT+7)'});
});

test('October month grid starts Monday and has six complete weeks',()=>{
  const grid=monthGrid(2026,10,'Asia/Ho_Chi_Minh');
  assert.equal(grid.length,6);
  assert.ok(grid.every(week=>week.length===7));
  assert.deepEqual(grid[0]?.[0],{date:'2026-09-28',inMonth:false});
  assert.deepEqual(grid[0]?.[3],{date:'2026-10-01',inMonth:true});
});
