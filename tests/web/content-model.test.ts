import test from 'node:test';
import assert from 'node:assert/strict';
import {platformVariant,publishTargetSummary,variantReadiness} from '../../apps/web/src/features/content/content-model.ts';

test('a missing platform variant is never marked ready',()=>{
  const readiness=variantReadiness([{id:'1',platform:'FACEBOOK',status:'READY'}]);
  assert.equal(readiness.find(row=>row.platform==='FACEBOOK')?.ready,true);
  assert.equal(readiness.find(row=>row.platform==='INSTAGRAM')?.ready,false);
  assert.equal(readiness.find(row=>row.platform==='INSTAGRAM')?.status,'MISSING');
});
test('variant lookup distinguishes draft and ready per platform',()=>{
  const variants=[{id:'1',platform:'FACEBOOK',status:'DRAFT'},{id:'2',platform:'TIKTOK',status:'READY'}];
  assert.equal(platformVariant(variants,'FACEBOOK')?.status,'DRAFT');
  assert.equal(platformVariant(variants,'TIKTOK')?.status,'READY');
  assert.equal(platformVariant(variants,'THREADS'),undefined);
});
test('partial publish validation separates valid and invalid targets',()=>{
  const summary=publishTargetSummary([{socialAccountId:'a',platform:'FACEBOOK',valid:true},{socialAccountId:'b',platform:'TIKTOK',valid:false,errors:['VARIANT_NOT_READY']}]);
  assert.equal(summary.validCount,1);assert.equal(summary.invalidCount,1);assert.equal(summary.canPublish,true);
  assert.equal(summary.invalidTargets[0]?.errors?.[0],'VARIANT_NOT_READY');
});
