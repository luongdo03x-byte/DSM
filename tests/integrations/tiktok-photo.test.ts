import test from 'node:test';
import assert from 'node:assert/strict';
import {TikTokAdapter,type TikTokPostSettings} from '../../apps/api/src/integrations/tiktok/tiktok.adapter.ts';
import {TikTokHttpClient} from '../../apps/api/src/integrations/tiktok/tiktok-http.client.ts';
import {PublishError,type PublishInput} from '../../packages/platform-contracts/src/index.ts';
import {preflight} from '../../packages/shared/src/preflight.ts';
import type {HttpClient,HttpRequest} from '../../packages/shared/src/http.ts';
import {MemoryRepositories} from '../../packages/shared/src/memory-repositories.ts';
import {MemoryStore} from '../../packages/shared/src/store.ts';
import {ContentService} from '../../apps/api/src/modules/content/content.service.ts';

const config={apiBaseUrl:'https://tiktok.test',authBaseUrl:'https://tiktok.test/auth',clientKey:'key',clientSecret:'secret',redirectUri:'https://dsm.test/callback',directPostApproved:false,verifiedMediaPrefixes:[]};
const settings:TikTokPostSettings={privacyLevel:'SELF_ONLY',disableComment:true,disableDuet:true,disableStitch:true,brandContentToggle:false,brandOrganicToggle:false};
const photos=(count:number)=>Array.from({length:count},(_,i)=>({url:`https://media.test/brand/photo-${i}.jpg`,mimeType:'image/jpeg',kind:'IMAGE' as const,width:1080,height:1920,isCover:i===1}));
const album=(count=3):PublishInput=>({brandId:'brand',socialAccountId:'account',contentVariantId:'variant',platform:'TIKTOK',contentType:'ALBUM',caption:'Album',media:photos(count),metadata:{tiktok:settings}});
function fixture(errorCode?:string){const calls:HttpRequest[]=[];const transport:HttpClient={async request<T>(req:HttpRequest){calls.push(req);if(req.url.includes('creator_info/query'))return{status:200,data:{data:{privacy_level_options:['SELF_ONLY'],max_video_post_duration_sec:600},error:{code:'ok'}} as T};if(req.url.includes('content/init'))return errorCode?{status:403,data:{error:{code:errorCode,message:'TikTok rejected URL'}} as T}:{status:200,data:{data:{publish_id:'photo-publish-1'},error:{code:'ok'}} as T};throw new Error('unexpected '+req.url)}};return{adapter:new TikTokAdapter({http:new TikTokHttpClient(transport,config),tokens:async()=> 'token',auditApproved:false,publicMediaBaseUrl:'https://media.test/brand/'}),calls}}

test('album sends ordered PHOTO URLs and the selected cover index',async()=>{
  const {adapter,calls}=fixture();const result=await adapter.publish(album());
  assert.deepEqual(result,{processing:true,remoteCorrelationId:'photo-publish-1'});
  const body=calls.find(call=>call.url.includes('content/init'))!.body as {media_type:string;post_mode:string;source_info:{source:string;photo_images:string[];photo_cover_index:number}};
  assert.equal(body.media_type,'PHOTO');assert.equal(body.post_mode,'DIRECT_POST');assert.equal(body.source_info.source,'PULL_FROM_URL');
  assert.deepEqual(body.source_info.photo_images,['https://media.test/brand/photo-0.jpg','https://media.test/brand/photo-1.jpg','https://media.test/brand/photo-2.jpg']);
  assert.equal(body.source_info.photo_cover_index,1);
});

test('preflight blocks TikTok photos without a public domain or outside its path',()=>{
  const facts=[{kind:'IMAGE' as const,mimeType:'image/jpeg',width:1080,height:1920,sizeBytes:100}];
  const missing=preflight({platform:'TIKTOK',format:'IMAGE',hashtags:[],media:facts,publicMediaBaseUrl:''});
  assert.equal(missing.find(issue=>issue.code==='TT_MEDIA_DOMAIN_NOT_CONFIGURED')?.severity,'error');
  const outside=preflight({platform:'TIKTOK',format:'IMAGE',hashtags:[],media:facts,publicMediaBaseUrl:'https://media.test/brand/',mediaUrls:['https://media.test.evil/brand/a.jpg']});
  assert.equal(outside.find(issue=>issue.code==='TT_MEDIA_URL_NOT_PUBLIC')?.severity,'error');
});

test('TikTok URL ownership error is a non-retryable validation failure',async()=>{
  const {adapter}=fixture('url_ownership_unverified');
  await assert.rejects(adapter.publish(album()),error=>error instanceof PublishError&&error.type==='VALIDATION_ERROR'&&!error.retryable&&error.code==='url_ownership_unverified');
});

test('36 photos fail before any TikTok API call',async()=>{
  const {adapter,calls}=fixture();await assert.rejects(adapter.publish(album(36)),error=>error instanceof PublishError&&error.code==='TT_ALBUM_MAX');
  assert.equal(calls.length,0);
});

test('composer preflight reports missing public media domain for a TikTok image variant',async()=>{
  const repos=new MemoryRepositories(new MemoryStore());await repos.brands.insert({id:'brand',workspaceId:'ws',name:'Brand',slug:'brand',language:'vi',timezone:'UTC',currency:'VND',status:'ACTIVE'});
  await repos.contents.insert({id:'content',brandId:'brand',type:'IMAGE',title:'Ảnh',status:'DRAFT'});
  await repos.media.insert({id:'image',brandId:'brand',workspaceId:'ws',type:'IMAGE',storageKey:'image.jpg',mimeType:'image/jpeg',width:1080,height:1920,sizeBytes:100});
  await repos.variants.insert({id:'variant',contentItemId:'content',platform:'TIKTOK',format:'IMAGE',hashtags:[],status:'READY'});
  await repos.variantMedia.insert({id:'variant-media',contentVariantId:'variant',mediaAssetId:'image',position:0,isCover:true});
  const issues=await new ContentService(repos,undefined,{publicMediaBaseUrl:''}).preflightVariant('brand','variant');
  assert.equal(issues.find(issue=>issue.code==='TT_MEDIA_DOMAIN_NOT_CONFIGURED')?.severity,'error');
});
