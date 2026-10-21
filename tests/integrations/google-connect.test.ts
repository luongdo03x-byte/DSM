import test from 'node:test';
import assert from 'node:assert/strict';
import {MemoryRepositories} from '../../packages/shared/src/memory-repositories.ts';
import {MemoryStore} from '../../packages/shared/src/store.ts';
import {CredentialCryptoService} from '../../apps/api/src/modules/accounts/credential-crypto.service.ts';
import {IntegrationsService} from '../../apps/api/src/modules/integrations/integrations.service.ts';
import {GoogleOAuthConnector,GoogleTokenRefreshService} from '../../apps/api/src/integrations/google/google-oauth.connector.ts';
import {refreshExpiringTokens} from '../../apps/worker/src/maintenance/token-refresh.job.ts';
import type {HttpClient,HttpRequest} from '../../packages/shared/src/http.ts';
import {startGoogleStub} from '../support/google-stub.ts';
import {createDevelopmentRuntime} from '../../apps/api/src/runtime/dev-runtime.ts';

const config={clientId:'google-client',clientSecret:'secret',redirectUri:'https://dsm.test/integrations/google/callback',authBaseUrl:'https://accounts.google.test/o/oauth2/v2/auth',tokenUrl:'https://oauth2.google.test/token',youtubeBaseUrl:'https://www.googleapis.test',audited:false};
function connectorFixture(revoked=false){
  const calls:HttpRequest[]=[];
  const http:HttpClient={async request<T>(request:HttpRequest){calls.push(request);
    if(request.url===config.tokenUrl){const form=new URLSearchParams(String(request.body));if(revoked&&form.get('grant_type')==='refresh_token')return{status:400,data:{error:'invalid_grant'} as T};return{status:200,data:{access_token:'google-access',refresh_token:'google-refresh',expires_in:3600,scope:'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly'} as T}}
    if(request.url.includes('/youtube/v3/channels'))return{status:200,data:{items:[{id:'channel-1',snippet:{title:'My channel'}}]} as T};
    throw new Error('unexpected request: '+request.url);
  }};
  return{connector:new GoogleOAuthConnector({http,config}),calls};
}
async function repositories(){const repos=new MemoryRepositories(new MemoryStore());await repos.workspaces.insert({id:'w',name:'Workspace'});await repos.brands.insert({id:'b',workspaceId:'w',name:'Brand',slug:'brand',language:'vi',timezone:'UTC',currency:'VND',status:'ACTIVE'});return repos}

test('Google authorization asks for offline upload/read scopes and PKCE',()=>{
  const {connector}=connectorFixture();const url=new URL(connector.authorizeUrl('state',config.redirectUri,'challenge'));
  assert.equal(url.searchParams.get('access_type'),'offline');assert.equal(url.searchParams.get('prompt'),'consent');assert.equal(url.searchParams.get('code_challenge_method'),'S256');
  assert.equal(url.searchParams.get('code_challenge'),'challenge');assert.deepEqual(url.searchParams.get('scope')?.split(' '),['https://www.googleapis.com/auth/youtube.upload','https://www.googleapis.com/auth/youtube.readonly','https://www.googleapis.com/auth/yt-analytics.readonly']);
});
test('Google callback lists channels and confirmation stores encrypted refresh token',async()=>{
  const {connector,calls}=connectorFixture(),repos=await repositories(),crypto=new CredentialCryptoService(new Uint8Array(32).fill(8));
  const service=new IntegrationsService({repos,crypto,google:connector,stateSecret:'secret'});
  const start=await service.start('GOOGLE','b','user');const state=new URL(start.url).searchParams.get('state')!;
  const callback=await service.callback('code',state);const selected=await service.confirm(callback.token,['channel-1']);
  assert.equal(selected[0]?.platform,'YOUTUBE');assert.equal(selected[0]?.platformAccountId,'channel-1');
  assert.ok(calls.some(call=>call.url.includes('/youtube/v3/channels?part=snippet&mine=true')));
  const tokenCall=calls.find(call=>call.url===config.tokenUrl)!;assert.equal(new URLSearchParams(String(tokenCall.body)).get('code_verifier')?.length,64);
  const credential=(await repos.credentials.findBy({socialAccountId:selected[0]!.id}))[0]!;
  assert.equal(credential.provider,'GOOGLE');assert.ok(!JSON.stringify(credential).includes('google-refresh'));
  assert.equal(await crypto.decrypt(JSON.parse(credential.refreshCiphertext!),'social-account:'+selected[0]!.id+':GOOGLE'),'google-refresh');
});
test('invalid_grant expires YouTube account and notifies',async()=>{
  const {connector}=connectorFixture(true),repos=await repositories(),crypto=new CredentialCryptoService(new Uint8Array(32).fill(8));
  const account=await repos.socialAccounts.insert({id:'a',brandId:'b',platform:'YOUTUBE',platformAccountId:'channel-1',publishMode:'API',status:'CONNECTED'});
  const encrypted=await crypto.encrypt('access','social-account:a:GOOGLE'),refresh=await crypto.encrypt('revoked','social-account:a:GOOGLE');
  await repos.credentials.insert({id:'c',socialAccountId:'a',provider:'GOOGLE',...encrypted,refreshCiphertext:JSON.stringify(refresh),expiresAt:Date.now()-1});
  const notices:string[]=[];await refreshExpiringTokens({repos,adapters:{YOUTUBE:new GoogleTokenRefreshService(repos,crypto,connector)},now:Date.now(),notify:async event=>{notices.push(event.kind)}});
  assert.equal((await repos.socialAccounts.get(account.id))?.status,'EXPIRED');assert.deepEqual(notices,['ACCOUNT_EXPIRED']);
});
test('Google start and callback routes expose a channel to confirmation',async()=>{
  const stub=await startGoogleStub();try{
    const app=await createDevelopmentRuntime({env:{DEV_OWNER_PASSWORD:'password',CREDENTIAL_ENCRYPTION_KEY:Buffer.alloc(32,9).toString('base64'),GOOGLE_CLIENT_ID:'google-client',GOOGLE_CLIENT_SECRET:'secret',GOOGLE_REDIRECT_URI:'https://dsm.test/integrations/google/callback',GOOGLE_OAUTH_BASE_URL:stub.url+'/authorize',GOOGLE_TOKEN_URL:stub.url+'/token',YOUTUBE_API_BASE_URL:stub.url,OAUTH_STATE_SECRET:'secret'}});
    const login=await app.runtime.handle({method:'POST',path:'/auth/login',body:{email:'owner@local.test',password:'password'}}),headers={authorization:'Bearer '+(login.body as {accessToken:string}).accessToken};
    const start=await app.runtime.handle({method:'POST',path:'/integrations/google/start',headers,body:{brandId:'local-brand'}});assert.equal(start.status,200);
    const url=new URL((start.body as {url:string}).url),callback=await app.runtime.handle({method:'GET',path:'/integrations/google/callback',query:{code:'code',state:url.searchParams.get('state')!}});
    assert.equal(callback.status,302);const token=new URL(callback.headers!.location!,'http://local.test').searchParams.get('connect')!;
    const pending=await app.runtime.handle({method:'GET',path:'/brands/local-brand/integrations/pending',query:{token},headers});assert.deepEqual((pending.body as Array<{platformAccountId:string}>).map(row=>row.platformAccountId),['stub-channel']);
    const confirmed=await app.runtime.handle({method:'POST',path:'/brands/local-brand/integrations/confirm',headers,body:{token,platformAccountIds:['stub-channel']}});assert.equal(confirmed.status,200);
  }finally{await stub.close()}
});
