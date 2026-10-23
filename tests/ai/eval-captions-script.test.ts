import test from 'node:test';
import assert from 'node:assert/strict';
import {validateEvalSet,estimatedUsd} from '../../scripts/ai/eval-captions.mjs';

test('paid evaluation requires exactly 20 distinct real-content slots and brand voice',()=>{
  const samples=Array.from({length:20},(_,index)=>({id:String(index+1),title:'Tiêu đề',body:'Nội dung'}));
  assert.equal(validateEvalSet({brandVoice:{tone:'Ấm áp'},samples}).samples.length,20);
  assert.throws(()=>validateEvalSet({brandVoice:{tone:'Ấm áp'},samples:samples.slice(1)}),/20/);
  assert.throws(()=>validateEvalSet({brandVoice:{tone:'Ấm áp'},samples:[...samples.slice(1),samples[1]]}),/duy nhất/);
  assert.throws(()=>validateEvalSet({brandVoice:{tone:''},samples}),/brandVoice/);
});

test('cost estimate reads recorded usage without calling AI',()=>{
  assert.equal(estimatedUsd([{usage:{inputTokens:1_000_000,outputTokens:1_000_000,cacheReadTokens:1_000_000}}]),24.2);
});
