import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import test from 'node:test';
import {MemoryStore} from '../../packages/shared/src/store.ts';
import {MemoryRepositories} from '../../packages/shared/src/memory-repositories.ts';
import {verifySignature, parseMetaWebhook} from '../../apps/api/src/integrations/meta/meta-webhook.ts';
import {ingestComment,runPendingMetaComments} from '../../apps/worker/src/engagement/ingest-comment.job.ts';
import {createDevelopmentRuntime} from '../../apps/api/src/runtime/dev-runtime.ts';
import {startApiServer} from '../../apps/api/src/main.ts';
import {MetaOAuthConnector} from '../../apps/api/src/integrations/meta/meta-oauth.service.ts';
import {MetaGraphClient} from '../../apps/api/src/integrations/meta/meta-http.client.ts';

const secret='webhook-secret';
const pageEvent={object:'page',entry:[{id:'page-7',time:1_700_000_000,changes:[{field:'feed',value:{item:'comment',verb:'add',comment_id:'comment-9',post_id:'post-3',from:{id:'visitor-1',name:'Bạn đọc'},message:'Giá bao nhiêu?',created_time:1_700_000_000}}]}]};

test('webhook từ chối chữ ký sai và chỉ trả challenge khi verify token đúng', async () => {
  const app=await createDevelopmentRuntime({env:{DEV_OWNER_PASSWORD:'password',CREDENTIAL_ENCRYPTION_KEY:Buffer.alloc(32,7).toString('base64'),META_APP_SECRET:secret,META_WEBHOOK_VERIFY_TOKEN:'verify-me'}});
  const server=startApiServer(0,app.runtime);
  try {
    await new Promise<void>(resolve=>server.once('listening',resolve));
    const address=server.address();if(!address||typeof address==='string')throw new Error('SERVER_NOT_LISTENING');
    const base=`http://127.0.0.1:${address.port}`;
    const wrong=await fetch(base+'/webhooks/meta?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=hello');
    assert.equal(wrong.status,403);
    const valid=await fetch(base+'/webhooks/meta?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=hello');
    assert.equal(valid.status,200);assert.equal(await valid.text(),'hello');
    const body=JSON.stringify(pageEvent);
    const invalid=await fetch(base+'/webhooks/meta',{method:'POST',headers:{'content-type':'application/json','x-hub-signature-256':'sha256=bad'},body});
    assert.equal(invalid.status,401);
    assert.equal((await app.repos.socialComments.findBy({})).length,0);
  } finally {await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()))}
});

test('chữ ký được tính trên byte gốc và nhận bình luận Page/Instagram', () => {
  const raw=Buffer.from(JSON.stringify(pageEvent));
  const signature='sha256='+createHmac('sha256',secret).update(raw).digest('hex');
  assert.equal(verifySignature(raw,signature,secret),true);
  assert.equal(verifySignature(Buffer.from(' '+raw.toString()),signature,secret),false);
  assert.deepEqual(parseMetaWebhook(pageEvent),[{socialPlatformAccountId:'page-7',platform:'FACEBOOK',platformCommentId:'comment-9',platformPostId:'post-3',authorId:'visitor-1',authorName:'Bạn đọc',text:'Giá bao nhiêu?',createdAt:1_700_000_000_000,verb:'add'}]);
  const ig={object:'instagram',entry:[{id:'ig-7',time:1_700_000_000,changes:[{field:'comments',value:{id:'ig-comment',media:{id:'ig-post'},from:{id:'ig-user',username:'khach'},text:'Chào',timestamp:'2023-11-14T22:13:20+0000'}}]}]};
  assert.deepEqual(parseMetaWebhook(ig),[{socialPlatformAccountId:'ig-7',platform:'INSTAGRAM',platformCommentId:'ig-comment',platformPostId:'ig-post',authorId:'ig-user',authorName:'khach',text:'Chào',createdAt:1_700_000_000_000,verb:'add'}]);
});

test('webhook hợp lệ vào hàng đợi bền vững trước khi worker xử lý', async () => {
  const app=await createDevelopmentRuntime({env:{DEV_OWNER_PASSWORD:'password',CREDENTIAL_ENCRYPTION_KEY:Buffer.alloc(32,7).toString('base64'),META_APP_SECRET:secret,META_WEBHOOK_VERIFY_TOKEN:'verify-me'}});
  await app.repos.socialAccounts.insert({id:'page-account',brandId:'local-brand',platform:'FACEBOOK',platformAccountId:'page-7',publishMode:'API',status:'CONNECTED'});
  const server=startApiServer(0,app.runtime);
  try {
    await new Promise<void>(resolve=>server.once('listening',resolve));
    const address=server.address();if(!address||typeof address==='string')throw new Error('SERVER_NOT_LISTENING');
    const raw=JSON.stringify(pageEvent);
    const signed='sha256='+createHmac('sha256',secret).update(raw).digest('hex');
    const response=await fetch(`http://127.0.0.1:${address.port}/webhooks/meta`,{method:'POST',headers:{'content-type':'application/json','x-hub-signature-256':signed},body:raw});
    assert.equal(response.status,200);
    assert.equal(app.store.metaWebhookEvents.size,1);
    assert.equal((await app.repos.socialComments.findBy({})).length,0);
    assert.equal(await runPendingMetaComments(app.store,app.repos),1);
    assert.equal(app.store.metaWebhookEvents.size,0);
    assert.equal((await app.repos.socialComments.findBy({})).length,1);
  } finally {await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()))}
});

test('webhook trùng không tạo bản ghi và hành động thứ hai; remove đánh dấu DELETED', async () => {
  const repos=new MemoryRepositories(new MemoryStore());
  await repos.workspaces.insert({id:'ws',name:'W'});
  await repos.brands.insert({id:'brand',workspaceId:'ws',name:'B',slug:'b',language:'vi',timezone:'UTC',currency:'VND',status:'ACTIVE'});
  await repos.socialAccounts.insert({id:'account',brandId:'brand',platform:'FACEBOOK',platformAccountId:'page-7',publishMode:'API',status:'CONNECTED'});
  const [event]=parseMetaWebhook(pageEvent);
  assert.ok(event);
  assert.equal(await ingestComment(repos,event),'CREATED');
  assert.equal(await ingestComment(repos,event),'DUPLICATE');
  const comments=await repos.socialComments.findBy({});
  assert.equal(comments.length,1);
  assert.equal(comments[0]?.isFromPage,false);
  assert.equal(await ingestComment(repos,{...event,verb:'remove'}),'UPDATED');
  assert.equal((await repos.socialComments.get(comments[0]!.id))?.status,'DELETED');
  assert.equal(await ingestComment(repos,{...event,platformCommentId:'self',authorId:'page-7'}),'CREATED');
  assert.equal((await repos.socialComments.findBy({platformCommentId:'self'}))[0]?.isFromPage,true);
});

test('chỉ đăng ký Page feed khi token có quyền quản lý metadata', async () => {
  const calls:Array<{url:string;method?:string;body?:string}>=[];
  const fetchImpl:typeof fetch=async(input,init)=>{calls.push({url:String(input),...(init?.method?{method:init.method}:{}),body:String(init?.body??'')});return new Response(JSON.stringify({success:true}),{status:200,headers:{'content-type':'application/json'}})};
  const connector=new MetaOAuthConnector({graph:new MetaGraphClient({baseUrl:'https://graph.example.test',version:'v24.0',fetchImpl}),appId:'app',appSecret:'secret',redirectUri:'https://local.test/callback'});
  const account={platform:'FACEBOOK' as const,platformAccountId:'page-7',displayName:'Page',tokens:{accessToken:'page-token',scopes:['pages_manage_metadata']}};
  assert.equal(await connector.subscribePageComments({...account,tokens:{...account.tokens,scopes:[]}}),false);
  assert.equal(calls.length,0);
  assert.equal(await connector.subscribePageComments(account),true);
  assert.equal(new URL(calls[0]!.url).pathname,'/v24.0/page-7/subscribed_apps');
  assert.match(calls[0]!.body??'',/"subscribed_fields":"feed"/);
});
