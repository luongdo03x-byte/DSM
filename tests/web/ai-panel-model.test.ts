import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyComposeState,composeReducer,isDirty} from '../../apps/web/src/features/compose/compose-model.ts';
import {applySuggestion} from '../../apps/web/src/features/compose/ai-panel-model.ts';

const suggestion={platform:'FACEBOOK' as const,hook:'Mở đầu AI',caption:'Chú thích AI #Thử',hashtags:['Thử'],rationale:'Phù hợp kênh'};

test('AI suggestion changes only the selected platform variant and leaves publishing manual',()=>{
  let state=emptyComposeState();
  state=composeReducer(state,{type:'editVariant',platform:'INSTAGRAM',patch:{caption:'Instagram gốc'}});
  state=composeReducer(state,{type:'markSaved'});
  const next=applySuggestion(state,'FACEBOOK',suggestion);
  assert.equal(next.variants.FACEBOOK?.caption,'Chú thích AI #Thử');
  assert.deepEqual(next.variants.FACEBOOK?.hashtags,['Thử']);
  assert.equal(next.variants.FACEBOOK?.hook,'Mở đầu AI');
  assert.equal(next.variants.INSTAGRAM?.caption,'Instagram gốc');
  assert.equal(next.body,state.body);
  assert.equal(isDirty(next),true);
  assert.equal(next.contentId,state.contentId);
});

test('AI suggestion leaves the selected schedule unchanged',()=>{
  const state=composeReducer(emptyComposeState(),{type:'setSchedule',schedule:{mode:'at',date:'2026-11-02',time:'14:00'}});
  const next=applySuggestion(state,'FACEBOOK',suggestion);
  assert.deepEqual(next.schedule,state.schedule);
  assert.deepEqual(next.selectedAccountIds,state.selectedAccountIds);
});
