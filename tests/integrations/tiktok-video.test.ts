import test from 'node:test';
import assert from 'node:assert/strict';
import {TikTokAdapter,type TikTokPostSettings} from '../../apps/api/src/integrations/tiktok/tiktok.adapter.ts';
import {TikTokHttpClient} from '../../apps/api/src/integrations/tiktok/tiktok-http.client.ts';
import {PublishError,type PublishInput} from '../../packages/platform-contracts/src/index.ts';
import type {HttpClient,HttpRequest} from '../../packages/shared/src/http.ts';
import {FetchHttpClient} from '../../packages/shared/src/http.ts';
import {createServer} from 'node:http';
import {createDevelopmentRuntime} from '../../apps/api/src/runtime/dev-runtime.ts';

const config={apiBaseUrl:'https://tiktok.test',authBaseUrl:'https://tiktok.test/auth',clientKey:'key',clientSecret:'secret',redirectUri:'https://dsm.test/callback',directPostApproved:false,verifiedMediaPrefixes:[]};
const settings:TikTokPostSettings={privacyLevel:'SELF_ONLY',disableComment:false,disableDuet:false,disableStitch:false,brandContentToggle:false,brandOrganicToggle:false};
const video=(patch:Partial<PublishInput>={}):PublishInput=>({brandId:'brand',socialAccountId:'account',contentVariantId:'variant',platform:'TIKTOK',contentType:'VIDEO',caption:'Video của tôi',media:[{url:'https://media.test/video.mp4',mimeType:'video/mp4',kind:'VIDEO',width:1080,height:1920,durationMs:30_000}],metadata:{tiktok:settings},...patch});
function fixture(opts:{commentDisabled?:boolean;privacyOptions?:string[];failSecondChunkOnce?:boolean;auditApproved?:boolean}={}){
  const calls:HttpRequest[]=[];let secondFailed=false;
  const transport:HttpClient={async request<T>(req:HttpRequest){calls.push(req);
    if(req.url.includes('creator_info/query'))return{status:200,data:{data:{privacy_level_options:opts.privacyOptions??['SELF_ONLY','PUBLIC_TO_EVERYONE'],max_video_post_duration_sec:600,comment_disabled:opts.commentDisabled??false,duet_disabled:false,stitch_disabled:false},error:{code:'ok'}} as T};
    if(req.url.includes('video/init'))return{status:200,data:{data:{publish_id:'publish-1',upload_url:'https://upload.tiktok.test/chunks'},error:{code:'ok'}} as T};
    if(req.url.includes('/chunks')){if(opts.failSecondChunkOnce&&req.headers?.['content-range']?.startsWith('bytes 10485760-')&&!secondFailed){secondFailed=true;return{status:500,data:{error:{code:'server_error'}} as T}}return{status:200,data:{} as T}}
    throw new Error('unexpected '+req.url);
  }};
  const adapter=new TikTokAdapter({http:new TikTokHttpClient(transport,config),tokens:async()=> 'access-token',auditApproved:opts.auditApproved??false,loadVideo:async()=>new Uint8Array(25*1024*1024)});
  return{adapter,calls};
}

test('creator_info lấy lại lúc đăng và chặn thiết lập bình luận đã lỗi thời',async()=>{
  const {adapter,calls}=fixture({commentDisabled:true});
  await assert.rejects(adapter.publish(video()),error=>error instanceof PublishError&&error.type==='VALIDATION_ERROR'&&error.code==='TT_SETTINGS_OUTDATED');
  assert.equal(calls.filter(call=>call.url.includes('creator_info/query')).length,1);
  assert.equal(calls.filter(call=>call.url.includes('video/init')).length,0);
});

test('TikTok rejects a privacy option absent from current creator_info',async()=>{
  const {adapter}=fixture({privacyOptions:['SELF_ONLY'],auditApproved:true});
  await assert.rejects(adapter.publish(video({metadata:{tiktok:{...settings,privacyLevel:'PUBLIC_TO_EVERYONE'}}})),error=>error instanceof PublishError&&error.code==='TT_PRIVACY_NOT_ALLOWED');
});

test('unaudited TikTok client permits SELF_ONLY only',async()=>{
  const {adapter}=fixture();
  await assert.rejects(adapter.publish(video({metadata:{tiktok:{...settings,privacyLevel:'PUBLIC_TO_EVERYONE'}}})),error=>error instanceof PublishError&&error.code==='TT_UNAUDITED_PRIVATE_ONLY');
});

test('video uses FILE_UPLOAD and Content-Range for a 25 MiB file',async()=>{
  const {adapter,calls}=fixture();const result=await adapter.publish(video());
  assert.deepEqual(result,{processing:true,remoteCorrelationId:'publish-1'});
  const init=calls.find(call=>call.url.includes('video/init'))!;assert.equal((init.body as {source_info:{source:string;total_chunk_count:number}}).source_info.source,'FILE_UPLOAD');
  assert.equal((init.body as {source_info:{total_chunk_count:number}}).source_info.total_chunk_count,2);
  assert.deepEqual(calls.filter(call=>call.method==='PUT').map(call=>call.headers?.['content-range']),['bytes 0-10485759/26214400','bytes 10485760-26214399/26214400']);
});

test('a failed second upload chunk retries that chunk without another init',async()=>{
  const {adapter,calls}=fixture({failSecondChunkOnce:true});await adapter.publish(video());
  assert.equal(calls.filter(call=>call.url.includes('video/init')).length,1);
  assert.deepEqual(calls.filter(call=>call.method==='PUT').map(call=>call.headers?.['content-range']),['bytes 0-10485759/26214400','bytes 10485760-26214399/26214400','bytes 10485760-26214399/26214400']);
});

test('FetchHttpClient sends video upload bytes unchanged',async()=>{
  let captured=Buffer.alloc(0);const server=createServer(async(req,res)=>{const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));captured=Buffer.concat(chunks);res.writeHead(200,{'content-type':'application/json'});res.end('{}')});
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{const address=server.address();if(!address||typeof address==='string')throw new Error('SERVER_NOT_LISTENING');
    await new FetchHttpClient().request({url:`http://127.0.0.1:${address.port}/upload`,method:'PUT',headers:{'content-type':'video/mp4'},body:new Uint8Array([0,255,1,2])});
    assert.deepEqual(captured,Buffer.from([0,255,1,2]));
  }finally{await new Promise<void>(resolve=>server.close(()=>resolve()))}
});

test('runtime registers TikTokAdapter as the API publisher',async()=>{
  const app=await createDevelopmentRuntime({env:{DEV_OWNER_PASSWORD:'password',CREDENTIAL_ENCRYPTION_KEY:Buffer.alloc(32,7).toString('base64')}});
  assert.ok(app.registry.get('TIKTOK','API') instanceof TikTokAdapter);
});
