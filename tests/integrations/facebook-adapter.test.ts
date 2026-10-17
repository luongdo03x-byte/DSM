import test from 'node:test';
import assert from 'node:assert/strict';
import {FacebookAdapter} from '../../apps/api/src/integrations/meta/facebook.adapter.ts';
import {MetaGraphClient} from '../../apps/api/src/integrations/meta/meta-http.client.ts';
import {startMetaGraphStub} from '../support/meta-graph-stub.ts';
import type {PublishInput} from '../../packages/platform-contracts/src/index.ts';

const base:PublishInput={brandId:'brand',socialAccountId:'account',contentVariantId:'variant',platform:'FACEBOOK',contentType:'TEXT',caption:'Hello',metadata:{pageId:'page'}};

test('Facebook text, link and image use the correct Page endpoints',async()=>{
  const stub=await startMetaGraphStub();try{
    stub.setResponse('/v24.0/page/feed',()=>({status:200,body:{id:'post-1'}}));
    stub.setResponse('/v24.0/page/photos',()=>({status:200,body:{id:'photo-1'}}));
    const adapter=new FacebookAdapter({graph:new MetaGraphClient({baseUrl:stub.url,version:'v24.0'}),tokens:async()=> 'page-token'});
    assert.equal((await adapter.publish(base)).externalPostId,'post-1');
    await adapter.publish({...base,metadata:{pageId:'page',format:'LINK',link:'https://shop.test/p'}});
    await adapter.publish({...base,contentType:'IMAGE',media:[{url:'https://cdn.test/a.jpg',mimeType:'image/jpeg',kind:'IMAGE',width:100,height:100}]});
    assert.deepEqual(stub.calls.map(x=>x.path),['/v24.0/page/feed','/v24.0/page/feed','/v24.0/page/photos']);
    assert.deepEqual(stub.calls[0]?.body,{message:'Hello'});
    assert.deepEqual(stub.calls[1]?.body,{message:'Hello',link:'https://shop.test/p'});
    assert.deepEqual(stub.calls[2]?.body,{url:'https://cdn.test/a.jpg',caption:'Hello'});
  }finally{await stub.close()}
});

test('Facebook album uploads unpublished photos in media order and attaches them to feed',async()=>{
  const stub=await startMetaGraphStub();try{
    let n=0;stub.setResponse('/v24.0/page/photos',()=>({status:200,body:{id:'photo-'+(++n)}}));stub.setResponse('/v24.0/page/feed',()=>({status:200,body:{id:'album-1'}}));
    const adapter=new FacebookAdapter({graph:new MetaGraphClient({baseUrl:stub.url,version:'v24.0'}),tokens:async()=> 'token'});
    const media=[1,2,3].map(n=>({url:`https://cdn.test/${n}.jpg`,mimeType:'image/jpeg',kind:'IMAGE' as const,width:100,height:100}));
    assert.equal((await adapter.publish({...base,contentType:'ALBUM',media})).externalPostId,'album-1');
    assert.deepEqual(stub.calls.map(x=>x.path),['/v24.0/page/photos','/v24.0/page/photos','/v24.0/page/photos','/v24.0/page/feed']);
    assert.deepEqual(stub.calls.slice(0,3).map(x=>x.body),media.map(x=>({url:x.url,published:false})));
    assert.deepEqual((stub.calls[3]?.body as any).attached_media,[{media_fbid:'photo-1'},{media_fbid:'photo-2'},{media_fbid:'photo-3'}]);
  }finally{await stub.close()}
});

test('Facebook video and reel return processing correlation',async()=>{
  const stub=await startMetaGraphStub();try{
    stub.setResponse('/v24.0/page/videos',()=>({status:200,body:{id:'video-1'}}));
    stub.setResponse('/v24.0/page/video_reels',req=>({status:200,body:req.body&&typeof req.body==='object'&&(req.body as any).upload_phase==='start'?{video_id:'reel-1',upload_url:'https://upload.test/reel'}:{success:true}}));
    const adapter=new FacebookAdapter({graph:new MetaGraphClient({baseUrl:stub.url,version:'v24.0'}),tokens:async()=> 'token'});
    const video={url:'https://cdn.test/v.mp4',mimeType:'video/mp4',kind:'VIDEO' as const,width:1080,height:1920,durationMs:30000};
    assert.deepEqual(await adapter.publish({...base,contentType:'VIDEO',media:[video]}),{remoteCorrelationId:'video-1',processing:true});
    assert.deepEqual(await adapter.publish({...base,contentType:'VIDEO',media:[video],metadata:{pageId:'page',format:'REEL'}}),{remoteCorrelationId:'reel-1',processing:true});
    assert.deepEqual(stub.calls.slice(1).map(x=>(x.body as any).upload_phase),['start','transfer','finish']);
  }finally{await stub.close()}
});

test('Facebook retry reconciles a timed-out feed response before posting again',async()=>{
  const stub=await startMetaGraphStub();try{
    let created=0;stub.setResponse('/v24.0/page/feed',()=>{created++;return{status:200,body:{id:'post-1'},delayMs:50}});
    stub.setResponse('/v24.0/page/published_posts',()=>({status:200,body:{data:created?[{id:'post-1',message:'Hello'}]:[]}}));
    const adapter=new FacebookAdapter({graph:new MetaGraphClient({baseUrl:stub.url,version:'v24.0',timeoutMs:20}),tokens:async()=> 'token'});
    await assert.rejects(adapter.publish(base),{code:'NETWORK'});
    const reconciled=await adapter.publish({...base,metadata:{pageId:'page',retrySince:123456}});
    assert.equal(reconciled.externalPostId,'post-1');assert.equal(created,1);
    assert.equal(stub.calls.at(-1)?.query.since,'123456');
  }finally{await stub.close()}
});

test('Facebook fetchPost reads remote permalink and creation time',async()=>{
  const stub=await startMetaGraphStub();try{
    stub.setResponse('/v24.0/post-1',()=>({status:200,body:{id:'post-1',permalink_url:'https://facebook.com/post-1',created_time:'2026-10-17T10:00:00Z'}}));
    const adapter=new FacebookAdapter({graph:new MetaGraphClient({baseUrl:stub.url,version:'v24.0'}),tokens:async()=> 'token'});
    assert.deepEqual(await adapter.fetchPost('post-1',{socialAccountId:'a'}),{externalPostId:'post-1',externalUrl:'https://facebook.com/post-1',publishedAt:Date.parse('2026-10-17T10:00:00Z'),exists:true});
    assert.equal(stub.calls[0]?.query.fields,'id,permalink_url,created_time');
  }finally{await stub.close()}
});
