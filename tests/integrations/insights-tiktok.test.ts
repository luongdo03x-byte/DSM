import test from 'node:test';
import assert from 'node:assert/strict';
import {TikTokAdapter} from '../../apps/api/src/integrations/tiktok/tiktok.adapter.ts';
import {TikTokHttpClient} from '../../apps/api/src/integrations/tiktok/tiktok-http.client.ts';
import type {HttpClient,HttpRequest} from '../../packages/shared/src/http.ts';
import {PublishError} from '../../packages/platform-contracts/src/index.ts';

const account={id:'tt',brandId:'b',platform:'TIKTOK' as const,publishMode:'API' as const,status:'CONNECTED' as const};
const config={apiBaseUrl:'https://tiktok.test',authBaseUrl:'https://tiktok.test/auth',clientKey:'k',clientSecret:'s',redirectUri:'https://app.test/cb',directPostApproved:false,verifiedMediaPrefixes:[]};
test('TikTok only returns current follower snapshot, with unavailable daily metrics null',async()=>{
  const http:HttpClient={async request<T>(request:HttpRequest){assert.match(request.url,/\/v2\/user\/info\//);return{status:200,data:{data:{user:{follower_count:123,avatar_url:'https://img.test/a',bio_description:'Bio',profile_deep_link:'https://tiktok.test/@me'}},error:{code:'ok'}} as T}}};
  const adapter=new TikTokAdapter({http:new TikTokHttpClient(http,config),tokens:async()=> 'token',auditApproved:false});
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'UTC',year:'numeric',month:'2-digit',day:'2-digit'}).format(Date.now());
  const rows=await adapter.fetchAccountDaily(account,'2026-10-01',today,'UTC');
  assert.equal(rows.length,1);assert.equal(rows[0]?.day,today);assert.equal(rows[0]?.followers,123);assert.equal(rows[0]?.views,null);
  assert.deepEqual(await adapter.fetchProfile(account),{hasAvatar:true,hasBio:true,hasLink:null});
});

test('TikTok post insights uses authorized video query metrics',async()=>{
  const http:HttpClient={async request<T>(request:HttpRequest){assert.match(request.url,/\/v2\/video\/query\//);return{status:200,data:{data:{videos:[{id:'clip',view_count:99,like_count:7,comment_count:2,share_count:1}]},error:{code:'ok'}} as T}}};
  const adapter=new TikTokAdapter({http:new TikTokHttpClient(http,config),tokens:async()=> 'token',auditApproved:false});
  const result=await adapter.fetchPostMetrics(account,'clip');
  assert.deepEqual([result.views,result.likes,result.comments,result.shares],[99,7,2,1]);
});

test('TikTok missing insights scope is classified as authorization',async()=>{
  const http:HttpClient={async request<T>(){return{status:403,data:{error:{code:'scope_not_authorized',message:'Scope missing'}} as T}}};
  const adapter=new TikTokAdapter({http:new TikTokHttpClient(http,config),tokens:async()=> 'token',auditApproved:false});
  await assert.rejects(adapter.fetchProfile(account),error=>error instanceof PublishError&&error.type==='AUTH_ERROR'&&error.code==='INSIGHTS_PERMISSION_MISSING');
});
