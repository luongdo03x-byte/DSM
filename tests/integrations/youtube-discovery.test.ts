import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {YouTubeAdapter} from '../../apps/api/src/integrations/google/youtube.adapter.ts';
import {InMemoryObjectStorage} from '../../apps/api/src/modules/media/media.service.ts';
import {createDevelopmentRuntime} from '../../apps/api/src/runtime/dev-runtime.ts';
import type {HttpClient,HttpRequest} from '../../packages/shared/src/http.ts';

test('YouTube discovery pages through playlists and filters unassignable categories',async()=>{
  const calls:HttpRequest[]=[];const http:HttpClient={async request<T>(r:HttpRequest){calls.push(r);const url=new URL(r.url);if(url.pathname.endsWith('/playlists'))return{status:200,data:(url.searchParams.has('pageToken')?{items:[{id:'p2',snippet:{title:'Second'}}]}:{items:[{id:'p1',snippet:{title:'First'}}],nextPageToken:'next'}) as T};return{status:200,data:{items:[{id:'22',snippet:{title:'People',assignable:true}},{id:'0',snippet:{title:'Reserved',assignable:false}}]} as T}}};
  const adapter=new YouTubeAdapter({baseUrl:'https://youtube.test',http,tokens:async()=> 'token',storage:new InMemoryObjectStorage(),audited:false});
  assert.deepEqual(await adapter.playlists('a'),[{id:'p1',title:'First'},{id:'p2',title:'Second'}]);assert.deepEqual(await adapter.categories('VN','a'),[{id:'22',title:'People'}]);assert.equal(calls.length,3);
});

test('YouTube playlist and category routes require an authorized channel',async()=>{
  const app=await createDevelopmentRuntime({env:{DEV_OWNER_EMAIL:'owner@youtube.test',DEV_OWNER_PASSWORD:'secret',JWT_ACCESS_SECRET:'test-secret',CREDENTIAL_ENCRYPTION_KEY:randomBytes(32).toString('base64')}});
  const account=await app.repos.socialAccounts.insert({id:'youtube-account',brandId:app.ids.brandId,platform:'YOUTUBE',publishMode:'API',status:'CONNECTED'});
  app.registry.register('YOUTUBE','API',new YouTubeAdapter({baseUrl:'https://youtube.test',http:{async request<T>(r:HttpRequest){return{status:200,data:(r.url.includes('videoCategories')?{items:[{id:'22',snippet:{title:'People'}}]}:{items:[{id:'playlist',snippet:{title:'Uploads'}}]}) as T}}},tokens:async()=> 'token',storage:new InMemoryObjectStorage(),audited:false}));
  const login=await app.runtime.handle({method:'POST',path:'/auth/login',body:{email:'owner@youtube.test',password:'secret'}}),headers={authorization:`Bearer ${(login.body as {accessToken:string}).accessToken}`};
  const list=await app.runtime.handle({method:'GET',path:`/brands/${app.ids.brandId}/accounts/${account.id}/youtube/playlists`,headers});assert.equal(list.status,200);assert.deepEqual(list.body,[{id:'playlist',title:'Uploads'}]);
  const categories=await app.runtime.handle({method:'GET',path:'/youtube/categories',headers,query:{regionCode:'VN'}});assert.equal(categories.status,200);assert.deepEqual(categories.body,{categories:[{id:'22',title:'People'}],audited:false});
  const denied=await app.runtime.handle({method:'GET',path:`/brands/${app.ids.brandId}/accounts/other/youtube/playlists`,headers});assert.equal(denied.status,404);
});
