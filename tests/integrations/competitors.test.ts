import test from 'node:test';
import assert from 'node:assert/strict';
import {CompetitorsService} from '../../apps/api/src/modules/growth/competitors.service.ts';
import {MetaGraphClient} from '../../apps/api/src/integrations/meta/meta-http.client.ts';
import {MemoryRepositories} from '../../packages/shared/src/memory-repositories.ts';
import {MemoryStore} from '../../packages/shared/src/store.ts';
import type {HttpClient,HttpRequest} from '../../packages/shared/src/http.ts';

test('Instagram competitor uses business_discovery and records source and capture time',async()=>{
  const repos=new MemoryRepositories(new MemoryStore());await repos.workspaces.insert({id:'w',name:'Workspace'});await repos.brands.insert({id:'b',workspaceId:'w',name:'Brand',slug:'b',language:'vi',timezone:'UTC',currency:'VND',status:'ACTIVE'});await repos.socialAccounts.insert({id:'own',brandId:'b',platform:'INSTAGRAM',platformAccountId:'own-ig',publishMode:'API',status:'CONNECTED'});
  const calls:string[]=[];const graph=new MetaGraphClient({baseUrl:'https://graph.test',version:'v24.0',fetchImpl:async input=>{calls.push(String(input));return Response.json({business_discovery:{id:'other',username:'competitor',followers_count:1250,media_count:42}})}});
  const service=new CompetitorsService({repos,graph,tokens:async()=> 'token',now:()=>Date.parse('2026-10-21T12:00:00Z')});
  const competitor=await service.add('b',{platform:'INSTAGRAM',handle:'competitor'});
  const snapshot=await service.capture(competitor.id);
  assert.ok(calls[0]?.includes('business_discovery.username'));
  assert.equal(snapshot.followers,1250);assert.equal(snapshot.posts,42);assert.equal(snapshot.source,'INSTAGRAM:business_discovery');assert.equal(snapshot.capturedAt,Date.parse('2026-10-21T12:00:00Z'));
});

test('Facebook and TikTok competitor values are explicitly manual',async()=>{
  const repos=new MemoryRepositories(new MemoryStore());await repos.workspaces.insert({id:'w',name:'Workspace'});await repos.brands.insert({id:'b',workspaceId:'w',name:'Brand',slug:'b',language:'vi',timezone:'UTC',currency:'VND',status:'ACTIVE'});
  const service=new CompetitorsService({repos,tokens:async()=> 'token',now:()=>Date.parse('2026-10-21T12:00:00Z')});
  const competitor=await service.add('b',{platform:'TIKTOK',handle:'other'});
  const snapshot=await service.captureManual(competitor.id,{followers:120,posts:null});
  assert.equal(competitor.source,'MANUAL');assert.equal(snapshot.source,'MANUAL');assert.equal(snapshot.followers,120);assert.equal(snapshot.posts,null);
});

test('YouTube competitor uses public channels.list statistics',async()=>{
  const repos=new MemoryRepositories(new MemoryStore());await repos.workspaces.insert({id:'w',name:'Workspace'});await repos.brands.insert({id:'b',workspaceId:'w',name:'Brand',slug:'b',language:'vi',timezone:'UTC',currency:'VND',status:'ACTIVE'});await repos.socialAccounts.insert({id:'own',brandId:'b',platform:'YOUTUBE',publishMode:'API',status:'CONNECTED'});
  const http:HttpClient={async request<T>(request:HttpRequest){assert.match(request.url,/forHandle=%40competitor/);return{status:200,data:{items:[{statistics:{subscriberCount:'1250',videoCount:'42'}}]} as T}}};
  const service=new CompetitorsService({repos,youtubeHttp:http,tokens:async()=> 'token',now:()=>Date.parse('2026-10-21T12:00:00Z'),youtubeBaseUrl:'https://youtube.test'});
  const competitor=await service.add('b',{platform:'YOUTUBE',handle:'@competitor'}),snapshot=await service.capture(competitor.id);
  assert.equal(snapshot.followers,1250);assert.equal(snapshot.posts,42);assert.equal(snapshot.source,'YOUTUBE:channels.list');
});
