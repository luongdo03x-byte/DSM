import test from 'node:test';
import assert from 'node:assert/strict';
import {InstagramAdapter} from '../../apps/api/src/integrations/meta/instagram.adapter.ts';
import {MetaGraphClient} from '../../apps/api/src/integrations/meta/meta-http.client.ts';
import {startMetaGraphStub} from '../support/meta-graph-stub.ts';
import type {PublishInput} from '../../packages/platform-contracts/src/index.ts';

const base:PublishInput={brandId:'b',socialAccountId:'a',contentVariantId:'v',platform:'INSTAGRAM',contentType:'IMAGE',caption:'Hello',media:[{url:'https://cdn.test/a.jpg',mimeType:'image/jpeg',kind:'IMAGE',width:1080,height:1350}],metadata:{format:'IMAGE',platformAccountId:'ig-1'}};
async function setup(){const stub=await startMetaGraphStub();const adapter=new InstagramAdapter({graph:new MetaGraphClient({baseUrl:stub.url,version:'v24.0'}),tokens:async()=> 'token',accountIds:async()=> 'ig-1'});stub.setResponse('/v24.0/ig-1/content_publishing_limit',()=>({status:200,body:{data:[{quota_usage:1}]}}));return{stub,adapter}}

test('Instagram image creates a container then publishes it',async()=>{const {stub,adapter}=await setup();try{
  stub.setResponse('/v24.0/ig-1/media',()=>({status:200,body:{id:'container-1'}}));stub.setResponse('/v24.0/container-1',()=>({status:200,body:{status_code:'FINISHED'}}));stub.setResponse('/v24.0/ig-1/media_publish',()=>({status:200,body:{id:'post-1'}}));
  assert.deepEqual(await adapter.publish(base),{remoteCorrelationId:'container-1',processing:true});
  assert.equal((await adapter.pollStatus({socialAccountId:'a',remoteCorrelationId:'container-1'})).externalPostId,'post-1');
  assert.deepEqual((stub.calls.find(x=>x.path==='/v24.0/ig-1/media')?.body),{image_url:'https://cdn.test/a.jpg',caption:'Hello'});
  assert.deepEqual(stub.calls.map(x=>x.path),['/v24.0/ig-1/content_publishing_limit','/v24.0/ig-1/media','/v24.0/container-1','/v24.0/ig-1/media_publish']);
}finally{await stub.close()}});

test('Instagram carousel creates children and parent in media order',async()=>{const {stub,adapter}=await setup();try{
  let n=0;stub.setResponse('/v24.0/ig-1/media',()=>({status:200,body:{id:'container-'+(++n)}}));stub.setResponse('/v24.0/container-4',()=>({status:200,body:{status_code:'FINISHED'}}));stub.setResponse('/v24.0/ig-1/media_publish',()=>({status:200,body:{id:'post-4'}}));
  const media=[1,2,3].map(n=>({...base.media![0]!,url:`https://cdn.test/${n}.jpg`}));
  assert.deepEqual(await adapter.publish({...base,contentType:'ALBUM',media,metadata:{format:'ALBUM',platformAccountId:'ig-1'}}),{remoteCorrelationId:'container-4',processing:true});
  assert.equal((await adapter.pollStatus({socialAccountId:'a',remoteCorrelationId:'container-4'})).externalPostId,'post-4');
  const bodies=stub.calls.filter(x=>x.path==='/v24.0/ig-1/media').map(x=>x.body as any);
  assert.deepEqual(bodies.slice(0,3),media.map(x=>({image_url:x.url,is_carousel_item:true})));
  assert.deepEqual(bodies[3],{media_type:'CAROUSEL',children:'container-1,container-2,container-3',caption:'Hello'});
}finally{await stub.close()}});

test('Instagram Reel and Story create processing containers',async()=>{const {stub,adapter}=await setup();try{
  let n=0;stub.setResponse('/v24.0/ig-1/media',()=>({status:200,body:{id:'container-'+(++n)}}));stub.setResponse('/v24.0/container-1',()=>({status:200,body:{status_code:'IN_PROGRESS'}}));stub.setResponse('/v24.0/container-2',()=>({status:200,body:{status_code:'IN_PROGRESS'}}));
  const video={url:'https://cdn.test/v.mp4',mimeType:'video/mp4',kind:'VIDEO' as const,width:1080,height:1920,durationMs:30000};
  assert.deepEqual(await adapter.publish({...base,contentType:'VIDEO',media:[video],metadata:{format:'REEL',platformAccountId:'ig-1'}}),{remoteCorrelationId:'container-1',processing:true});
  assert.deepEqual(await adapter.publish({...base,contentType:'VIDEO',media:[video],metadata:{format:'STORY',platformAccountId:'ig-1'}}),{remoteCorrelationId:'container-2',processing:true});
  assert.deepEqual(stub.calls.filter(x=>x.path==='/v24.0/ig-1/media').map(x=>(x.body as any).media_type),['REELS','STORIES']);
}finally{await stub.close()}});

test('Instagram poll waits for FINISHED then publishes, and fails on ERROR',async()=>{const {stub,adapter}=await setup();try{
  let status='IN_PROGRESS';stub.setResponse('/v24.0/container',()=>({status:200,body:{status_code:status}}));stub.setResponse('/v24.0/ig-1/media_publish',()=>({status:200,body:{id:'post-1'}}));
  assert.deepEqual(await adapter.pollStatus({socialAccountId:'a',remoteCorrelationId:'container'}),{remoteCorrelationId:'container',processing:true});
  status='FINISHED';assert.equal((await adapter.pollStatus({socialAccountId:'a',remoteCorrelationId:'container'})).externalPostId,'post-1');
  status='ERROR';await assert.rejects(adapter.pollStatus({socialAccountId:'a',remoteCorrelationId:'container'}),{type:'VALIDATION_ERROR',retryable:false});
}finally{await stub.close()}});

test('Instagram publication timeout keeps the container outcome uncertain',async()=>{const {stub,adapter}=await setup();try{
  stub.setResponse('/v24.0/container',()=>({status:200,body:{status_code:'FINISHED'}}));
  let published=0;stub.setResponse('/v24.0/ig-1/media_publish',()=>{published++;return{status:200,body:{id:'post-1'},delayMs:50}});
  const short=new InstagramAdapter({graph:new MetaGraphClient({baseUrl:stub.url,version:'v24.0',timeoutMs:20}),tokens:async()=> 'token',accountIds:async()=> 'ig-1'});
  await assert.rejects(short.pollStatus({socialAccountId:'a',remoteCorrelationId:'container'}),{code:'IG_PUBLISH_OUTCOME_UNKNOWN',retryable:false});
  assert.equal(published,1);
}finally{await stub.close()}});

test('Instagram daily publishing limit defers a new publish',async()=>{const {stub,adapter}=await setup();try{
  stub.setResponse('/v24.0/ig-1/content_publishing_limit',()=>({status:200,body:{data:[{quota_usage:100}]}}));
  await assert.rejects(adapter.publish(base),error=>{const e=error as {type:string;code:string;retryable:boolean;retryAfterMs:number};assert.equal(e.type,'RATE_LIMIT');assert.equal(e.code,'IG_DAILY_LIMIT');assert.equal(e.retryable,true);assert.ok(e.retryAfterMs>0);return true});
  assert.equal(stub.calls.filter(x=>x.path==='/v24.0/ig-1/media').length,0);
}finally{await stub.close()}});
