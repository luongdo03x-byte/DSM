import test from 'node:test';
import assert from 'node:assert/strict';
import {formatMetric,formatPercent,safeRatio} from '../../apps/web/src/lib/ui/format.ts';

test('formatters stay safe for missing metrics',()=>{
  assert.equal(formatMetric(null),'—');
  assert.equal(formatPercent(undefined),'—');
  assert.equal(formatPercent(Number.NaN),'—');
});
test('CTR returns no value without a valid denominator',()=>{
  assert.equal(safeRatio(10,0),null);
  assert.equal(safeRatio(10,null),null);
  assert.equal(formatPercent(safeRatio(10,0)),'—');
});
