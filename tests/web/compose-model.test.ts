import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyComposeState,composeReducer,isDirty,publishableTargets,hashtagsFromCaption} from '../../apps/web/src/features/compose/compose-model.ts';

test('có thay đổi chưa lưu sau khi sửa và hết sau khi lưu',()=>{
  const initial=emptyComposeState();
  assert.equal(isDirty(initial),false);
  const edited=composeReducer(initial,{type:'setField',field:'title',value:'Bài mới'});
  assert.equal(isDirty(edited),true);
  assert.equal(isDirty(composeReducer(edited,{type:'markSaved'})),false);
});

test('reorderMedia updates an untouched variant but preserves a custom order',()=>{
  let state=emptyComposeState();
  state=composeReducer(state,{type:'setMedia',mediaAssetIds:['a','b','c']});
  state=composeReducer(state,{type:'editVariant',platform:'FACEBOOK',patch:{mediaOrder:['a','b','c']}});
  state=composeReducer(state,{type:'editVariant',platform:'INSTAGRAM',patch:{mediaOrder:['c','b','a']}});
  state=composeReducer(state,{type:'reorderMedia',from:2,to:0});
  assert.deepEqual(state.mediaAssetIds,['c','a','b']);
  assert.deepEqual(state.variants.FACEBOOK?.mediaOrder,['c','a','b']);
  assert.deepEqual(state.variants.INSTAGRAM?.mediaOrder,['c','b','a']);
});

test('đăng một phần khi một đích bị chặn',()=>{
  let state=emptyComposeState();
  for(const [accountId,platform] of [['fb','FACEBOOK'],['ig','INSTAGRAM'],['tt','TIKTOK']] as const){
    state=composeReducer(state,{type:'toggleAccount',accountId,platform});
    state=composeReducer(state,{type:'editVariant',platform,patch:{caption:'Bài thử'}});
  }
  state=composeReducer(state,{type:'applyPreflight',platform:'INSTAGRAM',issues:[{code:'IG_HASHTAG_MAX',severity:'error',message:'Tối đa 5 hashtag',field:'caption'}]});
  assert.deepEqual(publishableTargets(state).map(x=>({accountId:x.accountId,blocked:x.blocked})),[{accountId:'fb',blocked:false},{accountId:'ig',blocked:true},{accountId:'tt',blocked:false}]);
  assert.deepEqual(publishableTargets(state)[1]?.reasons,['Tối đa 5 hashtag']);
});

test('biến thể YouTube bị bỏ qua hiển thị lý do tiếng Việt',()=>{
  let state=emptyComposeState();
  state=composeReducer(state,{type:'toggleAccount',accountId:'yt',platform:'YOUTUBE'});
  state=composeReducer(state,{type:'editVariant',platform:'YOUTUBE',patch:{skippedReason:'YouTube bỏ qua bài ảnh'}});
  assert.deepEqual(publishableTargets(state),[{accountId:'yt',platform:'YOUTUBE',blocked:true,reasons:['YouTube bỏ qua bài ảnh']}]);
});

test('hashtagsFromCaption reads Vietnamese hashtags',()=>{
  assert.deepEqual(hashtagsFromCaption('Chăm sóc #mỹphẩm và #DaĐẹp! #mỹphẩm'),['mỹphẩm','DaĐẹp']);
});
