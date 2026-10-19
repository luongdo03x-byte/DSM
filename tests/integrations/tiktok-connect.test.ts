import test from 'node:test';
import assert from 'node:assert/strict';
import {MemoryStore} from '../../packages/shared/src/store.ts';
import {MemoryRepositories} from '../../packages/shared/src/memory-repositories.ts';
import {CredentialCryptoService} from '../../apps/api/src/modules/accounts/credential-crypto.service.ts';
import {TikTokHttpClient} from '../../apps/api/src/integrations/tiktok/tiktok-http.client.ts';
import {TikTokOAuthConnector,TikTokTokenRefreshService} from '../../apps/api/src/integrations/tiktok/tiktok-oauth.service.ts';
import {IntegrationsService} from '../../apps/api/src/modules/integrations/integrations.service.ts';
import type {HttpClient,HttpRequest} from '../../packages/shared/src/http.ts';
import {startTikTokStub} from '../support/tiktok-stub.ts';
import {createDevelopmentRuntime} from '../../apps/api/src/runtime/dev-runtime.ts';

const config={apiBaseUrl:'https://tiktok.test',authBaseUrl:'https://www.tiktok.com/v2/auth/authorize/',clientKey:'client-key',clientSecret:'client-secret',redirectUri:'https://dsm.test/tiktok/callback',directPostApproved:false,verifiedMediaPrefixes:[]};
function fixture(){
  const calls:HttpRequest[]=[];
  const transport:HttpClient={async request<T>(req:HttpRequest){calls.push(req);if(req.url.endsWith('/v2/oauth/token/'))return{status:200,data:{data:{access_token:'access-secret',refresh_token:'refresh-secret',open_id:'open-1',expires_in:86400,scope:'user.info.basic,video.publish,video.upload'}} as T};if(req.url.includes('/v2/user/info/'))return{status:200,data:{data:{user:{open_id:'open-1',display_name:'Creator',username:'creator'}}} as T};throw new Error('unexpected request '+req.url)}};
  const connector=new TikTokOAuthConnector({http:new TikTokHttpClient(transport,config),config});
  return{calls,connector};
}

test('TikTok authorization carries client key, scopes, state and S256 challenge',()=>{
  const {connector}=fixture();const url=new URL(connector.authorizeUrl('signed-state',config.redirectUri,'challenge-hex'));
  assert.equal(url.searchParams.get('client_key'),'client-key');
  assert.equal(url.searchParams.get('state'),'signed-state');
  assert.equal(url.searchParams.get('code_challenge'),'challenge-hex');
  assert.equal(url.searchParams.get('code_challenge_method'),'S256');
  assert.equal(url.searchParams.get('scope'),'user.info.basic,video.publish,video.upload');
});

test('TikTok code exchange sends the stored PKCE verifier and maps one creator account',async()=>{
  const {calls,connector}=fixture();const tokens=await connector.exchangeCode('auth-code',config.redirectUri,'private-verifier');
  const body=new URLSearchParams(String(calls[0]?.body));
  assert.equal(body.get('code_verifier'),'private-verifier');
  assert.equal(body.get('code'),'auth-code');
  assert.equal(tokens.expiresAt!>Date.now()+23*60*60_000,true);
  assert.deepEqual((await connector.listAccounts(tokens)).map(account=>[account.platform,account.platformAccountId,account.displayName]),[['TIKTOK','open-1','Creator']]);
  assert.ok(!calls[1]?.url.includes('username'));
});

test('TikTok confirmation encrypts its refresh token and marks the account connected',async()=>{
  const {connector}=fixture(),repos=new MemoryRepositories(new MemoryStore()),crypto=new CredentialCryptoService(new Uint8Array(32).fill(4));
  await repos.workspaces.insert({id:'ws',name:'Workspace'});await repos.brands.insert({id:'brand',workspaceId:'ws',name:'Brand',slug:'brand',language:'vi',timezone:'Asia/Ho_Chi_Minh',currency:'VND',status:'ACTIVE'});
  const service=new IntegrationsService({repos,crypto,tiktok:connector,stateSecret:'state-secret'});
  const start=await service.start('TIKTOK','brand','user');const state=new URL(start.url).searchParams.get('state')!;
  const pendingRow=(await repos.oauthPending.findBy({brandId:'brand'}))[0]!;
  assert.ok(!JSON.stringify(pendingRow).includes('code_verifier'));
  const callback=await service.callback('auth-code',state);const selected=await service.confirm(callback.token,['open-1']);
  assert.deepEqual(selected.map(account=>[account.platform,account.platformAccountId,account.status]),[['TIKTOK','open-1','CONNECTED']]);
  const credential=(await repos.credentials.findBy({socialAccountId:selected[0]!.id}))[0]!;
  assert.equal(credential.provider,'TIKTOK');
  assert.ok(!JSON.stringify(credential).includes('refresh-secret'));
  const refresh=JSON.parse(credential.refreshCiphertext!) as {ciphertext:string;iv:string;authTag:string};
  assert.equal(await crypto.decrypt(refresh,'social-account:'+selected[0]!.id+':TIKTOK'),'refresh-secret');
});

test('TikTok refresh requests a new access token and a 24-hour expiry',async()=>{
  const {calls,connector}=fixture();const refreshed=await connector.refreshToken('old-refresh');
  assert.equal(new URLSearchParams(String(calls[0]?.body)).get('grant_type'),'refresh_token');
  assert.equal(new URLSearchParams(String(calls[0]?.body)).get('refresh_token'),'old-refresh');
  assert.equal(refreshed.accessToken,'access-secret');
  assert.equal(refreshed.expiresAt!>Date.now()+23*60*60_000,true);
});

test('TikTok token refresh replaces encrypted credential and expiry',async()=>{
  const {connector}=fixture(),repos=new MemoryRepositories(new MemoryStore()),crypto=new CredentialCryptoService(new Uint8Array(32).fill(4));
  const account=await repos.socialAccounts.insert({id:'account-1',brandId:'brand',platform:'TIKTOK',platformAccountId:'open-1',publishMode:'API',status:'CONNECTED'});
  const access=await crypto.encrypt('old-access','social-account:account-1:TIKTOK'),refresh=await crypto.encrypt('old-refresh','social-account:account-1:TIKTOK');
  await repos.credentials.insert({id:'credential-1',socialAccountId:account.id,provider:'TIKTOK',...access,refreshCiphertext:JSON.stringify(refresh),expiresAt:Date.now()-1000});
  const result=await new TikTokTokenRefreshService(repos,crypto,connector).refresh(account);
  assert.equal(result.refreshed,true);
  const changed=(await repos.credentials.get('credential-1'))!;
  assert.equal(await crypto.decrypt(changed,'social-account:account-1:TIKTOK'),'access-secret');
  assert.equal(changed.expiresAt!>Date.now()+23*60*60_000,true);
});

test('TikTok start and callback routes connect the creator through the shared pending flow',async()=>{
  const stub=await startTikTokStub();try{
    const app=await createDevelopmentRuntime({env:{DEV_OWNER_PASSWORD:'password',CREDENTIAL_ENCRYPTION_KEY:Buffer.alloc(32,7).toString('base64'),TIKTOK_CLIENT_KEY:'client-key',TIKTOK_CLIENT_SECRET:'client-secret',TIKTOK_REDIRECT_URI:'https://dsm.test/tiktok/callback',TIKTOK_API_BASE_URL:stub.url,OAUTH_STATE_SECRET:'state-secret'}});
    const login=await app.runtime.handle({method:'POST',path:'/auth/login',body:{email:'owner@local.test',password:'password'}});
    const headers={authorization:'Bearer '+(login.body as {accessToken:string}).accessToken};
    const start=await app.runtime.handle({method:'POST',path:'/integrations/tiktok/start',headers,body:{brandId:'local-brand'}});
    assert.equal(start.status,200);const url=new URL((start.body as {url:string}).url);assert.ok(url.searchParams.get('code_challenge'));
    const callback=await app.runtime.handle({method:'GET',path:'/integrations/tiktok/callback',query:{code:'auth-code',state:url.searchParams.get('state')!}});
    assert.equal(callback.status,302);const token=new URL(callback.headers!.location!,'http://local.test').searchParams.get('connect')!;
    const pending=await app.runtime.handle({method:'GET',path:'/brands/local-brand/integrations/pending',query:{token},headers});
    assert.deepEqual((pending.body as Array<{platformAccountId:string}>).map(row=>row.platformAccountId),['stub-user']);
    const confirm=await app.runtime.handle({method:'POST',path:'/brands/local-brand/integrations/confirm',headers,body:{token,platformAccountIds:['stub-user']}});
    assert.equal(confirm.status,200);assert.equal((confirm.body as Array<{platform:string}>)[0]?.platform,'TIKTOK');
  }finally{await stub.close()}
});
