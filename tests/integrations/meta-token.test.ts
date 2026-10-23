import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {MemoryRepositories} from '../../packages/shared/src/memory-repositories.ts';
import {MemoryStore} from '../../packages/shared/src/store.ts';
import {CredentialCryptoService} from '../../apps/api/src/modules/accounts/credential-crypto.service.ts';
import {AccountsService} from '../../apps/api/src/modules/accounts/accounts.service.ts';
import {refreshExpiringTokens,TOKEN_WARN_BEFORE_MS} from '../../apps/worker/src/maintenance/token-refresh.job.ts';
import {MetaDataDeletionService} from '../../apps/api/src/modules/integrations/meta-data-deletion.service.ts';
import {JobRunner} from '../../apps/worker/src/publishing/job-runner.service.ts';
import {PublisherRegistry} from '../../apps/api/src/modules/publishing/publisher-registry.ts';
import {FakePublisher} from '../../apps/worker/src/testing/fake-publisher.ts';
import {PublishError} from '../../packages/platform-contracts/src/index.ts';
import {MetaTokenRefreshService} from '../../apps/api/src/integrations/meta/meta-token-refresh.service.ts';
import {MetaOAuthConnector} from '../../apps/api/src/integrations/meta/meta-oauth.service.ts';
import {MetaGraphClient} from '../../apps/api/src/integrations/meta/meta-http.client.ts';
import {startMetaGraphStub} from '../support/meta-graph-stub.ts';
import {createDevelopmentRuntime} from '../../apps/api/src/runtime/dev-runtime.ts';
import {startApiServer} from '../../apps/api/src/main.ts';

function signedRequest(payload:Record<string,unknown>,secret:string){const body=Buffer.from(JSON.stringify(payload)).toString('base64url');return createHmac('sha256',secret).update(body).digest('base64url')+'.'+body}

test('Meta revoked token marks account EXPIRED and fails publish job',async()=>{
  const repos=new MemoryRepositories(new MemoryStore()),registry=new PublisherRegistry(),publisher=new FakePublisher();
  await repos.socialAccounts.insert({id:'a',brandId:'b',platform:'FACEBOOK',publishMode:'API',status:'CONNECTED'});
  await repos.publishJobs.insert({id:'job',batchId:'batch',brandId:'b',socialAccountId:'a',contentVariantId:'v',platform:'FACEBOOK',strategy:'API',scheduledAt:1,status:'QUEUED',attemptCount:0,maxAttempts:4,idempotencyKey:'revoked'});
  publisher.fail=new PublishError({type:'AUTH_ERROR',code:'190',message:'Invalid token',retryable:false});registry.register('FACEBOOK','API',publisher);
  const result=await new JobRunner(repos,registry).run('job',async()=>({brandId:'b',socialAccountId:'a',contentVariantId:'v',platform:'FACEBOOK',contentType:'TEXT'}));
  assert.equal(result,'FAILED');assert.equal((await repos.socialAccounts.get('a'))?.status,'EXPIRED');assert.equal((await repos.publishJobs.get('job'))?.errorCode,'190');
});

test('token expiring in five days is reported and adapter refreshes when available',async()=>{
  const now=1_000_000,repos=new MemoryRepositories(new MemoryStore());
  await repos.socialAccounts.insert({id:'a',brandId:'b',platform:'FACEBOOK',publishMode:'API',status:'CONNECTED'});
  await repos.credentials.insert({id:'c',socialAccountId:'a',provider:'META',ciphertext:'cipher',iv:'iv',authTag:'tag',expiresAt:now+5*24*60*60_000});
  let calls=0;const adapter={refreshToken:async()=>{calls++;return{refreshed:true,expiresAt:now+60*24*60*60_000}}};
  const result=await refreshExpiringTokens({repos,adapters:{FACEBOOK:adapter} as any,now});
  assert.equal(TOKEN_WARN_BEFORE_MS,7*24*60*60_000);assert.equal(result.refreshed,1);assert.equal(calls,1);assert.deepEqual(result.expiringSoon.map(x=>x.id),[]);
  assert.equal((await repos.credentials.get('c'))?.expiresAt,now+60*24*60*60_000);
});

test('Meta data deletion rejects invalid signature and removes matching credential',async()=>{
  const repos=new MemoryRepositories(new MemoryStore()),crypto=new CredentialCryptoService(new Uint8Array(32).fill(7)),accounts=new AccountsService(repos,crypto);
  await repos.socialAccounts.insert({id:'a',brandId:'b',platform:'FACEBOOK',platformAccountId:'page',publishMode:'API',status:'CONNECTED'});
  await accounts.saveCredential('a','META','page-token');
  const credential=(await repos.credentials.findBy({socialAccountId:'a'}))[0]!;await repos.credentials.update(credential.id,{providerUserId:'meta-user'});
  await repos.socialComments.insert({id:'comment',brandId:'b',socialAccountId:'a',platform:'FACEBOOK',platformCommentId:'remote-comment',platformPostId:'post',authorId:'person',authorName:'An',isFromPage:false,text:'Thông tin cá nhân',createdAt:123,status:'NEW'});
  await repos.commentActions.insert({id:'action',commentId:'comment',kind:'REPLY',text:'Đã trả lời',status:'DONE',createdAt:124});
  const service=new MetaDataDeletionService({repos,appSecret:'secret',statusBaseUrl:'https://dsm.test/data-deletion'});
  await assert.rejects(service.handle('invalid.signature'),/INVALID_SIGNED_REQUEST/);
  const response=await service.handle(signedRequest({user_id:'meta-user',algorithm:'HMAC-SHA256',issued_at:123},'secret'));
  assert.match(response.url,/data-deletion/);assert.ok(response.confirmation_code);
  assert.equal((await repos.credentials.findBy({socialAccountId:'a'})).length,0);
  assert.equal((await repos.socialAccounts.get('a'))?.status,'DISCONNECTED');
  assert.equal(await repos.socialComments.get('comment'),undefined);
  assert.equal(await repos.commentActions.get('action'),undefined);
});

test('Meta refresh exchanges user token and replaces encrypted Page token',async()=>{
  const stub=await startMetaGraphStub();try{
    stub.setResponse('/v24.0/oauth/access_token',()=>({status:200,body:{access_token:'new-user',expires_in:5184000}}));
    stub.setResponse('/v24.0/me',()=>({status:200,body:{id:'meta-user'}}));
    stub.setResponse('/v24.0/me/accounts',()=>({status:200,body:{data:[{id:'page',name:'Page',access_token:'new-page'}]}}));
    const repos=new MemoryRepositories(new MemoryStore()),crypto=new CredentialCryptoService(new Uint8Array(32).fill(7)),accounts=new AccountsService(repos,crypto);
    const account=await repos.socialAccounts.insert({id:'a',brandId:'b',platform:'FACEBOOK',platformAccountId:'page',publishMode:'API',status:'CONNECTED'});
    await accounts.saveCredential('a','META','old-page','old-user');
    const connector=new MetaOAuthConnector({graph:new MetaGraphClient({baseUrl:stub.url,version:'v24.0'}),appId:'app',appSecret:'secret',redirectUri:'http://local/callback'});
    const result=await new MetaTokenRefreshService(repos,crypto,connector).refresh(account);
    assert.equal(result.refreshed,true);assert.equal(await accounts.getAccessToken('a'),'new-page');
    assert.equal((await repos.credentials.findBy({socialAccountId:'a'}))[0]?.providerUserId,'meta-user');
  }finally{await stub.close()}
});

test('Meta data deletion HTTP callback accepts signed form body without login',async()=>{
  const app=await createDevelopmentRuntime({env:{DEV_OWNER_PASSWORD:'password',CREDENTIAL_ENCRYPTION_KEY:Buffer.alloc(32,7).toString('base64'),META_APP_SECRET:'secret'}});
  const server=startApiServer(0,app.runtime);try{
    await new Promise<void>(resolve=>server.once('listening',resolve));const address=server.address();if(!address||typeof address==='string')throw new Error('NO_SERVER');
    const base=`http://127.0.0.1:${address.port}/integrations/meta/data-deletion`;
    const invalid=await fetch(base,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({signed_request:'invalid.signature'})});assert.equal(invalid.status,400);
    const valid=await fetch(base,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({signed_request:signedRequest({user_id:'meta-user',algorithm:'HMAC-SHA256'},'secret')})});
    assert.equal(valid.status,200);assert.ok((await valid.json() as {confirmation_code:string}).confirmation_code);
  }finally{await new Promise<void>(resolve=>server.close(()=>resolve()))}
});
