import test from 'node:test';
import assert from 'node:assert/strict';
import {YouTubeAdapter} from '../../apps/api/src/integrations/google/youtube.adapter.ts';
import {InMemoryObjectStorage} from '../../apps/api/src/modules/media/media.service.ts';
import {createDevelopmentRuntime} from '../../apps/api/src/runtime/dev-runtime.ts';
import type {HttpClient,HttpRequest} from '../../packages/shared/src/http.ts';

test('YouTube uploads a Vietnamese SRT caption track after the video',async()=>{
  const calls:HttpRequest[]=[];
  const http:HttpClient={async request<T>(request:HttpRequest){calls.push(request);if(request.url.includes('uploadType=resumable'))return{status:200,data:{} as T,headers:{location:'https://upload.test/session'}};if(request.url==='https://upload.test/session')return{status:200,data:{id:'video-1'} as T};if(request.url.includes('/captions?'))return{status:200,data:{id:'caption-1'} as T};throw new Error('Unexpected '+request.url)}};
  const storage=new InMemoryObjectStorage();await storage.putObject('video',Buffer.from([1,2,3]),'video/mp4');await storage.putObject('subtitles',Buffer.from('1\n00:00:00,000 --> 00:00:01,000\nXin chào\n'),'application/x-subrip');
  const adapter=new YouTubeAdapter({baseUrl:'https://youtube.test',http,tokens:async()=> 'token',storage,audited:true});
  const result=await adapter.publish({brandId:'brand',socialAccountId:'account',contentVariantId:'variant',platform:'YOUTUBE',contentType:'VIDEO',caption:'Clip',media:[{url:'https://media.test/video',storageKey:'video',sizeBytes:3,mimeType:'video/mp4',kind:'VIDEO',width:1,height:2}],metadata:{youtube:{madeForKids:false},subtitleStorageKey:'subtitles'}});
  assert.equal(result.externalPostId,'video-1');
  const upload=calls.find(call=>call.url.includes('/captions?'))!;
  assert.match(upload.url,/uploadType=multipart&part=snippet/);
  assert.match(Buffer.from(upload.body as Buffer).toString('utf8'),/"language":"vi"/);
  assert.match(Buffer.from(upload.body as Buffer).toString('utf8'),/Xin chào/);
});

test('subtitle route scopes video to the current brand and reports unavailable worker',async()=>{
  const app=await createDevelopmentRuntime({env:{DEV_OWNER_PASSWORD:'secret',CREDENTIAL_ENCRYPTION_KEY:Buffer.alloc(32,2).toString('base64')}});
  await app.repos.media.insert({id:'video',brandId:app.ids.brandId,workspaceId:app.ids.workspaceId,type:'VIDEO',storageKey:'video',mimeType:'video/mp4'});
  const login=await app.runtime.handle({method:'POST',path:'/auth/login',body:{email:'owner@local.test',password:'secret'}});
  const headers={authorization:'Bearer '+(login.body as {accessToken:string}).accessToken};
  assert.equal((await app.runtime.handle({method:'POST',path:'/brands/local-brand/media/video/subtitles'})).status,401);
  assert.equal((await app.runtime.handle({method:'POST',path:'/brands/local-brand/media/other/subtitles',headers})).status,404);
  assert.equal((await app.runtime.handle({method:'POST',path:'/brands/local-brand/media/video/subtitles',headers})).status,503);
});
