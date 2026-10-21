import test from 'node:test';
import assert from 'node:assert/strict';
import {vnEvents} from '../../packages/shared/src/growth/vn-calendar.ts';

test('Vietnam calendar includes Black Friday and double-date sale days',()=>{
  const events=vnEvents(2026);
  assert.ok(events.some(event=>event.date==='2026-11-27'&&event.name==='Black Friday'&&event.kind==='SALE'));
  assert.ok(events.some(event=>event.date==='2026-11-11'&&event.kind==='SALE'));
});
test('Vietnam lunar Tet 2030 uses Vietnam UTC+7 date',()=>{
  assert.ok(vnEvents(2030).some(event=>event.date==='2030-02-02'&&event.name==='Tết Nguyên đán'));
  assert.ok(!vnEvents(2030).some(event=>event.date==='2030-02-03'&&event.name==='Tết Nguyên đán'));
});
