import test from 'node:test';
import assert from 'node:assert/strict';
import {MemoryRepositories} from '../../packages/shared/src/memory-repositories.ts';
import {MemoryStore} from '../../packages/shared/src/store.ts';
import {AccountsService} from '../../apps/api/src/modules/accounts/accounts.service.ts';
import {CredentialCryptoService} from '../../apps/api/src/modules/accounts/credential-crypto.service.ts';

test('ngắt kết nối xóa bình luận và hành động của đúng tài khoản',async()=>{
  const repos=new MemoryRepositories(new MemoryStore());
  for(const id of ['a','other'])await repos.socialAccounts.insert({id,brandId:'b',platform:'FACEBOOK',publishMode:'API',status:'CONNECTED'});
  for(const [id,account] of [['c','a'],['other-comment','other']] as const){
    await repos.socialComments.insert({id,brandId:'b',socialAccountId:account,platform:'FACEBOOK',platformCommentId:id,platformPostId:'p',authorId:'user',authorName:'A',isFromPage:false,text:'Hi',createdAt:1,status:'NEW'});
    await repos.commentActions.insert({id:'act-'+id,commentId:id,kind:'REPLY',status:'DONE',createdAt:1});
  }
  await new AccountsService(repos,new CredentialCryptoService(new Uint8Array(32).fill(1))).disconnect('b','a');
  assert.equal(await repos.socialComments.get('c'),undefined);
  assert.equal(await repos.commentActions.get('act-c'),undefined);
  assert.ok(await repos.socialComments.get('other-comment'));
});
