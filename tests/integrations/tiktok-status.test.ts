import test from 'node:test';
import assert from 'node:assert/strict';
import {TikTokAdapter} from '../../apps/api/src/integrations/tiktok/tiktok.adapter.ts';
import {TikTokHttpClient} from '../../apps/api/src/integrations/tiktok/tiktok-http.client.ts';
import {PublishError} from '../../packages/platform-contracts/src/index.ts';
import type {HttpClient,HttpRequest} from '../../packages/shared/src/http.ts';

const config={apiBaseUrl:'https://tiktok.test',authBaseUrl:'https://tiktok.test/auth',clientKey:'key',clientSecret:'secret',redirectUri:'https://dsm.test/callback',directPostApproved:false,verifiedMediaPrefixes:[]};
function fixture(statuses:Array<{status:string;publicaly_available_post_id?:number[];fail_reason?:string}>){
  const calls:HttpRequest[]=[];
  const transport:HttpClient={async request<T>(req:HttpRequest){calls.push(req);return{status:200,data:{data:statuses.shift()??{status:'PROCESSING_UPLOAD'},error:{code:'ok'}} as T}}};
  const adapter=new TikTokAdapter({http:new TikTokHttpClient(transport,config),tokens:async()=> 'access-token',auditApproved:false,username:async()=> 'my.creator'});
  return{adapter,calls};
}

test('poll transitions from upload/download processing to PUBLISH_COMPLETE with public URL',async()=>{
  const {adapter,calls}=fixture([{status:'PROCESSING_UPLOAD'},{status:'PROCESSING_DOWNLOAD'},{status:'PUBLISH_COMPLETE',publicaly_available_post_id:[123456]}]);
  const input={socialAccountId:'account',remoteCorrelationId:'publish-1'};
  assert.equal((await adapter.pollStatus(input)).processing,true);
  assert.equal((await adapter.pollStatus(input)).processing,true);
  const done=await adapter.pollStatus(input);
  assert.equal(done.externalPostId,'123456');assert.equal(done.externalUrl,'https://www.tiktok.com/@my.creator/video/123456');
  assert.equal(done.processing,false);assert.equal(calls.length,3);
});

test('FAILED status returns a non-retryable platform error',async()=>{
  const {adapter}=fixture([{status:'FAILED',fail_reason:'picture_size_check_failed'}]);
  await assert.rejects(adapter.pollStatus({socialAccountId:'account',remoteCorrelationId:'publish-1'}),error=>error instanceof PublishError&&error.type==='PLATFORM_ERROR'&&!error.retryable&&error.code==='picture_size_check_failed');
});

test('a private completed post is published without a public URL',async()=>{
  const {adapter}=fixture([{status:'PUBLISH_COMPLETE',publicaly_available_post_id:[]}]);
  const done=await adapter.pollStatus({socialAccountId:'account',remoteCorrelationId:'private-publish'});
  assert.equal(done.processing,false);assert.equal(done.externalPostId,'private-publish');assert.equal(done.externalUrl,undefined);assert.equal(done.note,'Bài riêng tư');
});
