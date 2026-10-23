import assert from 'node:assert/strict';
import test from 'node:test';
import {MemoryStore} from '../../packages/shared/src/store.ts';
import {MemoryRepositories} from '../../packages/shared/src/memory-repositories.ts';
import type {SocialComment,SocialAccount} from '../../packages/shared/src/domain.ts';
import type {CommentSource} from '../../packages/platform-contracts/src/comments.ts';
import {PublishError} from '../../packages/platform-contracts/src/index.ts';
import {EngagementService} from '../../apps/api/src/modules/engagement/engagement.service.ts';
import {pollComments} from '../../apps/worker/src/engagement/poll-comments.job.ts';
import {YouTubeAdapter} from '../../apps/api/src/integrations/google/youtube.adapter.ts';
import {InMemoryObjectStorage} from '../../apps/api/src/modules/media/media.service.ts';
import type {HttpClient,HttpRequest} from '../../packages/shared/src/http.ts';
import {createDevelopmentRuntime} from '../../apps/api/src/runtime/dev-runtime.ts';
import {startApiServer} from '../../apps/api/src/main.ts';
import {FacebookAdapter} from '../../apps/api/src/integrations/meta/facebook.adapter.ts';
import {InstagramAdapter} from '../../apps/api/src/integrations/meta/instagram.adapter.ts';
import {MetaGraphClient} from '../../apps/api/src/integrations/meta/meta-http.client.ts';

const account:SocialAccount={id:'account',brandId:'brand',platform:'FACEBOOK',platformAccountId:'page-1',publishMode:'API',status:'CONNECTED'};
const comment=(id:string,createdAt:number):SocialComment=>({id,brandId:'brand',socialAccountId:'account',platform:'FACEBOOK',platformCommentId:'remote-'+id,platformPostId:'post',authorId:'visitor',authorName:'Khách',isFromPage:false,text:'Xin chào',createdAt,status:'NEW'});
async function fixture(){const store=new MemoryStore(),repos=new MemoryRepositories(store);await repos.workspaces.insert({id:'ws',name:'W'});await repos.brands.insert({id:'brand',workspaceId:'ws',name:'B',slug:'b',language:'vi',timezone:'UTC',currency:'VND',status:'ACTIVE'});await repos.socialAccounts.insert(account);return{store,repos}}
function source(reply:CommentSource['reply']):CommentSource{return{listSince:async()=>[],reply,hide:async()=>{}}}

test('hộp thư phân trang ổn định theo thời gian giảm dần và ID',async()=>{
  const {repos}=await fixture();for(const row of [comment('a',100),comment('b',200),comment('c',200)])await repos.socialComments.insert(row);
  const service=new EngagementService(repos,{FACEBOOK:source(async()=>({platformCommentId:'reply'}))});
  const first=await service.list('brand',{limit:2});
  assert.deepEqual(first.items.map(x=>x.id),['c','b']);assert.ok(first.nextCursor);
  const second=await service.list('brand',{limit:2,cursor:first.nextCursor});
  assert.deepEqual(second.items.map(x=>x.id),['a']);assert.equal(second.nextCursor,undefined);
  assert.deepEqual((await service.list('brand',{status:['NEW'],platform:'FACEBOOK'})).items.map(x=>x.id),['c','b','a']);
});

test('trả lời bình luận đã xóa đánh dấu DELETED và ghi hành động FAILED',async()=>{
  const {repos}=await fixture();await repos.socialComments.insert(comment('gone',100));
  const service=new EngagementService(repos,{FACEBOOK:source(async()=>{throw new PublishError({type:'PLATFORM_ERROR',code:'HTTP_404',message:'Comment not found',retryable:false})})});
  await assert.rejects(service.reply('brand','gone','Cảm ơn bạn','owner'),/COMMENT_GONE/);
  assert.equal((await repos.socialComments.get('gone'))?.status,'DELETED');
  const actions=await repos.commentActions.findBy({commentId:'gone'});
  assert.equal(actions.length,1);assert.equal(actions[0]?.status,'FAILED');assert.equal(actions[0]?.errorCode,'COMMENT_GONE');
});

test('YouTube không hỗ trợ ẩn bình luận qua DSM',async()=>{
  const {repos}=await fixture();await repos.socialAccounts.update('account',{platform:'YOUTUBE'});await repos.socialComments.insert({...comment('yt',100),platform:'YOUTUBE'});
  const service=new EngagementService(repos,{YOUTUBE:source(async()=>({platformCommentId:'reply'}))});
  await assert.rejects(service.hide('brand','yt',true,'owner'),/NOT_SUPPORTED/);
  assert.equal((await repos.commentActions.findBy({})).length,0);
});

test('YouTube lấy commentThreads của kênh, theo trang và chỉ giữ bình luận mới',async()=>{
  const urls:string[]=[];
  const http:HttpClient={request:async<T>(req:HttpRequest)=>{urls.push(req.url);const page=new URL(req.url).searchParams.get('pageToken');const data=page?{items:[{snippet:{videoId:'video-2',topLevelComment:{id:'comment-2',snippet:{authorChannelId:{value:'viewer-2'},authorDisplayName:'Khách 2',textOriginal:'Mới',publishedAt:'2026-10-22T00:00:00Z'}}}}]}:{nextPageToken:'next',items:[{snippet:{videoId:'video-1',topLevelComment:{id:'comment-1',snippet:{authorChannelId:{value:'viewer-1'},authorDisplayName:'Khách 1',textOriginal:'Cũ',publishedAt:'2026-10-01T00:00:00Z'}}}}]};return{status:200,data:data as T}}};
  const adapter=new YouTubeAdapter({baseUrl:'https://youtube.test',http,tokens:async()=> 'token',storage:new InMemoryObjectStorage(),audited:true});
  const comments=await adapter.listSince({...account,platform:'YOUTUBE',platformAccountId:'channel-1'},Date.parse('2026-10-20T00:00:00Z'));
  assert.deepEqual(comments.map(x=>x.platformCommentId),['comment-2']);
  assert.equal(new URL(urls[0]!).searchParams.get('allThreadsRelatedToChannelId'),'channel-1');
  assert.equal(new URL(urls[1]!).searchParams.get('pageToken'),'next');
});

test('poll YouTube dùng checkpoint và lưu comment sau khi có bài trong 30 ngày',async()=>{
  const {repos}=await fixture();await repos.socialAccounts.update('account',{platform:'YOUTUBE',platformAccountId:'channel-1',commentsPolledAt:1_000});
  await repos.publishedPosts.insert({id:'post',brandId:'brand',publishJobId:'job',socialAccountId:'account',contentVariantId:'variant',platform:'YOUTUBE',platformPostId:'video',publishedAt:900_000});
  const seen:number[]=[];const youtube:CommentSource={reply:async()=>({platformCommentId:'r'}),listSince:async(_account,since)=>{seen.push(since);return[{socialAccountId:'account',platform:'YOUTUBE',platformCommentId:'remote-new',platformPostId:'video',authorId:'viewer',authorName:'Khách',isFromPage:false,text:'Mới',createdAt:950_000}]}};
  assert.equal(await pollComments(repos,{YOUTUBE:youtube},1_000_000),1);
  assert.equal(seen[0],1_000);
  assert.equal((await repos.socialComments.findBy({platformCommentId:'remote-new'})).length,1);
  assert.equal((await repos.socialAccounts.get('account'))?.commentsPolledAt,1_000_000);
});

test('API hộp thư yêu cầu phiên đăng nhập và chỉ liệt kê bình luận của brand',async()=>{
  const app=await createDevelopmentRuntime({env:{DEV_OWNER_PASSWORD:'password',CREDENTIAL_ENCRYPTION_KEY:Buffer.alloc(32,7).toString('base64')}});
  const connected=(await app.repos.socialAccounts.findBy({brandId:'local-brand',platform:'FACEBOOK'}))[0]!;
  await app.repos.socialComments.insert({...comment('api-comment',100),brandId:'local-brand',socialAccountId:connected.id});
  const server=startApiServer(0,app.runtime);
  try{
    await new Promise<void>(resolve=>server.once('listening',resolve));const address=server.address();if(!address||typeof address==='string')throw new Error('SERVER_NOT_LISTENING');const base=`http://127.0.0.1:${address.port}`;
    assert.equal((await fetch(base+'/brands/local-brand/comments')).status,401);
    const login=await fetch(base+'/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'owner@local.test',password:'password'})});const {accessToken}=await login.json() as {accessToken:string};
    const response=await fetch(base+'/brands/local-brand/comments?status=NEW&limit=10',{headers:{authorization:'Bearer '+accessToken}});
    assert.equal(response.status,200);const data=await response.json() as {items:SocialComment[]};assert.deepEqual(data.items.map(x=>x.id),['api-comment']);
    const invalid=await fetch(base+'/brands/local-brand/comments?limit=not-a-number',{headers:{authorization:'Bearer '+accessToken}});
    assert.equal(invalid.status,400);
  }finally{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()))}
});

test('Facebook và Instagram gửi trả lời và ẩn qua đúng comment endpoint',async()=>{
  const calls:Array<{path:string;body:unknown}>=[];
  const graph=new MetaGraphClient({baseUrl:'https://graph.test',version:'v24.0',fetchImpl:async(input,init)=>{calls.push({path:new URL(String(input)).pathname,body:JSON.parse(String(init?.body??'{}'))});return new Response(JSON.stringify({id:'new-reply',success:true}),{status:200})}});
  const facebook=new FacebookAdapter({graph,tokens:async()=> 'token'});
  const instagram=new InstagramAdapter({graph,tokens:async()=> 'token',accountIds:async()=> 'ig-1'});
  assert.equal((await facebook.reply(account,'fb-comment','Cảm ơn')).platformCommentId,'new-reply');
  await facebook.hide(account,'fb-comment',true);
  assert.equal((await instagram.reply({...account,platform:'INSTAGRAM'},'ig-comment','Cảm ơn')).platformCommentId,'new-reply');
  await instagram.hide({...account,platform:'INSTAGRAM'},'ig-comment',true);
  assert.deepEqual(calls.map(x=>x.path),['/v24.0/fb-comment/comments','/v24.0/fb-comment','/v24.0/ig-comment/replies','/v24.0/ig-comment']);
  assert.deepEqual(calls.map(x=>x.body),[{message:'Cảm ơn'},{is_hidden:true},{message:'Cảm ơn'},{hide:true}]);
});
