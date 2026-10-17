import test from 'node:test';
import assert from 'node:assert/strict';
import {MemoryStore} from '../../packages/shared/src/store.ts';
import {MemoryRepositories} from '../../packages/shared/src/memory-repositories.ts';
import {CredentialCryptoService} from '../../apps/api/src/modules/accounts/credential-crypto.service.ts';
import {MetaGraphClient} from '../../apps/api/src/integrations/meta/meta-http.client.ts';
import {MetaOAuthConnector} from '../../apps/api/src/integrations/meta/meta-oauth.service.ts';
import {IntegrationsService} from '../../apps/api/src/modules/integrations/integrations.service.ts';
import {startMetaGraphStub} from '../support/meta-graph-stub.ts';
import {createDevelopmentRuntime} from '../../apps/api/src/runtime/dev-runtime.ts';
import {startApiServer} from '../../apps/api/src/main.ts';

test('Meta exchanges code for long-lived user token and lists Page with linked Instagram', async () => {
  const stub=await startMetaGraphStub();
  try {
    stub.setResponse('/v24.0/oauth/access_token', req => ({status:200,body:req.query.grant_type==='fb_exchange_token'?{access_token:'long-user',expires_in:5184000}:{access_token:'short-user',expires_in:3600}}));
    stub.setResponse('/v24.0/me/accounts', () => ({status:200,body:{data:[{id:'page-1',name:'Page One',access_token:'page-secret',instagram_business_account:{id:'ig-1',username:'ig-one'}}]}}));
    const connector=new MetaOAuthConnector({graph:new MetaGraphClient({baseUrl:stub.url,version:'v24.0'}),appId:'app',appSecret:'secret',redirectUri:'https://local.test/callback'});
    const tokens=await connector.exchangeCode('code','https://local.test/callback');
    assert.equal(tokens.accessToken,'long-user');
    const accounts=await connector.listAccounts(tokens);
    assert.deepEqual(accounts.map(x=>[x.platform,x.platformAccountId,x.tokens.accessToken]),[['FACEBOOK','page-1','page-secret'],['INSTAGRAM','ig-1','page-secret']]);
    assert.equal(stub.calls.filter(x=>x.path.includes('/oauth/access_token')).length,2);
  } finally {await stub.close()}
});

test('Meta lists every Page across Graph cursor pages', async () => {
  const stub=await startMetaGraphStub();try {
    stub.setResponse('/v24.0/me/accounts',req=>({status:200,body:req.query.after?{data:[{id:'page-2',name:'Two',access_token:'two'}]}:{data:[{id:'page-1',name:'One',access_token:'one'}],paging:{next:'http://stub/next',cursors:{after:'cursor-1'}}}}));
    const connector=new MetaOAuthConnector({graph:new MetaGraphClient({baseUrl:stub.url,version:'v24.0'}),appId:'app',appSecret:'secret',redirectUri:'http://local/callback'});
    assert.deepEqual((await connector.listAccounts({accessToken:'user',scopes:[]})).map(x=>x.platformAccountId),['page-1','page-2']);
  } finally {await stub.close()}
});

test('Meta confirmation stores only selected Page and encrypted credential', async () => {
  const stub=await startMetaGraphStub();
  try {
    stub.setResponse('/v24.0/oauth/access_token', req => ({status:200,body:{access_token:req.query.grant_type==='fb_exchange_token'?'long-user':'short-user',expires_in:3600}}));
    stub.setResponse('/v24.0/me/accounts', () => ({status:200,body:{data:[{id:'page-1',name:'One',access_token:'secret-1',instagram_business_account:{id:'ig-1',username:'ig-one'}},{id:'page-2',name:'Two',access_token:'secret-2'}]}}));
    const store=new MemoryStore(),repos=new MemoryRepositories(store),crypto=new CredentialCryptoService(new Uint8Array(32).fill(7));
    await repos.workspaces.insert({id:'ws',name:'W'});await repos.brands.insert({id:'brand',workspaceId:'ws',name:'B',slug:'b',language:'en',timezone:'UTC',currency:'USD',status:'ACTIVE'});
    const connector=new MetaOAuthConnector({graph:new MetaGraphClient({baseUrl:stub.url,version:'v24.0'}),appId:'app',appSecret:'secret',redirectUri:'https://local.test/callback'});
    const service=new IntegrationsService({repos,crypto,meta:connector,stateSecret:'state-secret'});
    const start=await service.start('META','brand','user');
    const state=new URL(start.url).searchParams.get('state')!;
    const callback=await service.callback('code',state);
    assert.deepEqual((await service.pending(callback.token)).map(x=>x.platformAccountId),['page-1','ig-1','page-2']);
    const selected=await service.confirm(callback.token,['page-1']);
    assert.deepEqual(selected.map(x=>[x.platform,x.platformAccountId,x.status,x.publishMode]),[['FACEBOOK','page-1','CONNECTED','API']]);
    assert.equal((await repos.socialAccounts.findBy({brandId:'brand'})).length,1);
    const credential=(await repos.credentials.findBy({socialAccountId:selected[0]!.id}))[0]!;
    assert.ok(!credential.ciphertext.includes('secret-1'));
    assert.equal(await crypto.decrypt(credential,'social-account:'+selected[0]!.id+':META'),'secret-1');
    await assert.rejects(service.confirm(callback.token,['page-2']),/OAUTH_PENDING_CONSUMED/);
  } finally {await stub.close()}
});

test('Meta HTTP routes carry query parameters and require account owner', async () => {
  const stub=await startMetaGraphStub();
  stub.setResponse('/v24.0/oauth/access_token',req=>({status:200,body:{access_token:req.query.grant_type?'long-user':'short-user'}}));
  stub.setResponse('/v24.0/me/accounts',()=>({status:200,body:{data:[{id:'page-1',name:'One',access_token:'page-secret'}]}}));
  const app=await createDevelopmentRuntime({env:{DEV_OWNER_PASSWORD:'password',CREDENTIAL_ENCRYPTION_KEY:Buffer.alloc(32,7).toString('base64'),META_APP_ID:'app',META_APP_SECRET:'secret',META_REDIRECT_URI:'http://127.0.0.1/callback',OAUTH_STATE_SECRET:'state-secret',META_GRAPH_BASE_URL:stub.url}});
  const server=startApiServer(0,app.runtime);
  try {
    await new Promise<void>(resolve=>server.once('listening',resolve));
    const address=server.address();if(!address||typeof address==='string')throw new Error('SERVER_NOT_LISTENING');const base=`http://127.0.0.1:${address.port}`;
    const login=await fetch(base+'/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'owner@local.test',password:'password'})});
    const {accessToken}=await login.json() as {accessToken:string};
    const auth={authorization:'Bearer '+accessToken};
    const unauth=await fetch(base+'/integrations/meta/start?brandId=local-brand',{redirect:'manual'});assert.equal(unauth.status,401);
    const startJson=await fetch(base+'/integrations/meta/start',{method:'POST',headers:{...auth,'content-type':'application/json'},body:JSON.stringify({brandId:'local-brand'})});
    assert.equal(startJson.status,200);assert.ok((await startJson.json() as {url:string}).url.includes('state='));
    const start=await fetch(base+'/integrations/meta/start?brandId=local-brand',{headers:auth,redirect:'manual'});assert.equal(start.status,302);
    const state=new URL(start.headers.get('location')!).searchParams.get('state')!;
    const callback=await fetch(base+'/integrations/meta/callback?code=code&state='+encodeURIComponent(state),{redirect:'manual'});assert.equal(callback.status,302);
    assert.equal(new URL(callback.headers.get('location')!).origin,'http://127.0.0.1:3000');
    const token=new URL(callback.headers.get('location')!,base).searchParams.get('connect')!;
    const pending=await fetch(base+'/brands/local-brand/integrations/pending?token='+encodeURIComponent(token),{headers:auth});assert.equal(pending.status,200);
    const choices=await pending.json() as Array<{platformAccountId:string;tokens:{accessToken:string}}>;
    assert.equal(choices[0]?.platformAccountId,'page-1');assert.equal(choices[0]?.tokens.accessToken,'');
    const confirm=await fetch(base+'/brands/local-brand/integrations/confirm',{method:'POST',headers:{...auth,'content-type':'application/json'},body:JSON.stringify({token,platformAccountIds:['page-1']})});
    assert.equal(confirm.status,200);
  } finally {await new Promise<void>(resolve=>server.close(()=>resolve()));await stub.close()}
});
