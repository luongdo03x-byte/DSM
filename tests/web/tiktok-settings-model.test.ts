import test from 'node:test';
import assert from 'node:assert/strict';
import {canSubmit,tiktokSettingsState} from '../../apps/web/src/features/compose/tiktok-settings-model.ts';

const info={privacyLevelOptions:['PUBLIC_TO_EVERYONE','SELF_ONLY'],maxVideoPostDurationSec:600,commentDisabled:false,duetDisabled:true,stitchDisabled:false};
test('privacy has no default and must be chosen before submit',()=>{
  const state=tiktokSettingsState(info,true);
  assert.equal(state.privacyRequired,true);
  assert.equal(canSubmit({},state),false);
  assert.equal(canSubmit({privacyLevel:'SELF_ONLY'},state),true);
});
test('creator disabled duet locks the option',()=>{
  const state=tiktokSettingsState(info,true);
  assert.equal(state.duetLocked,true);
  assert.equal(canSubmit({privacyLevel:'SELF_ONLY',disableDuet:false},state),false);
});
test('unaudited app only offers private posting with notice',()=>{
  const state=tiktokSettingsState(info,false);
  assert.deepEqual(state.privacyOptions,[{value:'SELF_ONLY',label:'Chỉ mình tôi'}]);
  assert.match(state.notice??'',/chưa được TikTok duyệt/);
  assert.equal(canSubmit({privacyLevel:'PUBLIC_TO_EVERYONE'},state),false);
});
