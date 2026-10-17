import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {startMetaGraphStub} from '../support/meta-graph-stub.ts';

const exec=promisify(execFile),script=fileURLToPath(new URL('../../scripts/smoke/meta-publish.mjs',import.meta.url));

test('Meta smoke script stays inert without explicit live flag',async()=>{
  const result=await exec(process.execPath,[script],{env:{...process.env,LIVE_META_SMOKE:'0'}});
  assert.match(result.stdout,/skipped/);
});

test('Meta smoke script publishes two test Page posts and deletes both',async()=>{
  const stub=await startMetaGraphStub();try{
    stub.setResponse('/v24.0/test-page/feed',()=>({status:200,body:{id:'post-text'}}));
    stub.setResponse('/v24.0/test-page/photos',()=>({status:200,body:{id:'post-image'}}));
    stub.setResponse('/v24.0/post-text',()=>({status:200,body:{success:true}}));
    stub.setResponse('/v24.0/post-image',()=>({status:200,body:{success:true}}));
    const result=await exec(process.execPath,[script],{env:{...process.env,LIVE_META_SMOKE:'1',META_SMOKE_CONFIRM_TEST_PAGE:'1',META_SMOKE_PAGE_ID:'test-page',META_SMOKE_PAGE_TOKEN:'token',META_SMOKE_IMAGE_URL:'https://cdn.test/a.jpg',META_GRAPH_BASE_URL:stub.url,META_GRAPH_VERSION:'v24.0'}});
    assert.match(result.stdout,/facebook.com\/post-text/);assert.match(result.stdout,/facebook.com\/post-image/);assert.match(result.stdout,/deleted/);
    assert.deepEqual(stub.calls.map(x=>[x.method,x.path]),[['POST','/v24.0/test-page/feed'],['POST','/v24.0/test-page/photos'],['DELETE','/v24.0/post-image'],['DELETE','/v24.0/post-text']]);
  }finally{await stub.close()}
});
