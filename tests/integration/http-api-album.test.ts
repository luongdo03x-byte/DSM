import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {once} from 'node:events';
import type {AddressInfo} from 'node:net';
import {test} from 'node:test';
import {createDevelopmentRuntime} from '../../apps/api/src/runtime/dev-runtime.ts';
import {startApiServer} from '../../apps/api/src/main.ts';
import {LocalWorkerRuntime} from '../../apps/worker/src/runtime/local-worker.ts';
import {FakePublisher} from '../../apps/worker/src/testing/fake-publisher.ts';

test('http api album journey',async t=>{
  const app=await createDevelopmentRuntime({env:{DEV_OWNER_EMAIL:'album@dsm.test',DEV_OWNER_PASSWORD:'album-password',CREDENTIAL_ENCRYPTION_KEY:randomBytes(32).toString('base64'),JWT_ACCESS_SECRET:randomBytes(32).toString('hex')}});
  for(const platform of ['FACEBOOK','INSTAGRAM','TIKTOK'] as const)app.registry.register(platform,'API',new FakePublisher());
  const server=startApiServer(0,app.runtime);
  t.after(()=>new Promise<void>((resolve,reject)=>{server.close(error=>error?reject(error):resolve());server.closeAllConnections()}));
  await once(server,'listening');
  const base=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  let token='';
  const call=async(method:string,path:string,body?:unknown)=>{const response=await fetch(base+path,{method,headers:{...(token?{authorization:`Bearer ${token}`}:{}),...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});return{status:response.status,body:await response.json() as any}};
  const login=await call('POST','/auth/login',{email:'album@dsm.test',password:'album-password'});
  assert.equal(login.status,200);token=login.body.accessToken;
  const root='/brands/local-brand';
  const assetIds:string[]=[];
  for(let i=0;i<3;i++){const upload=await call('POST',`${root}/media/uploads`,{type:'IMAGE',mimeType:'image/jpeg'});assert.equal(upload.status,201);assetIds.push(upload.body.assetId)}
  const created=await call('POST',`${root}/content`,{type:'ALBUM',title:'Three images',body:'Album caption',mediaAssetIds:assetIds});
  assert.equal(created.status,201);
  const variants=await call('POST',`${root}/content/${created.body.id}/variants/copy`);
  assert.equal(variants.status,200);
  const ig=variants.body.find((variant:{platform:string})=>variant.platform==='INSTAGRAM');
  const ordered=await call('PUT',`${root}/content/${created.body.id}/media`,{mediaAssetIds:[assetIds[2],assetIds[0],assetIds[1]]});
  assert.equal(ordered.status,200);assert.deepEqual(ordered.body.map((row:{mediaAssetId:string})=>row.mediaAssetId),[assetIds[2],assetIds[0],assetIds[1]]);
  const cropped=await call('PUT',`${root}/content/${created.body.id}/variants/${ig.id}/media`,{items:[
    {mediaAssetId:assetIds[2],crop:{x:10,y:0,width:80,height:100},isCover:true},
    {mediaAssetId:assetIds[0]},{mediaAssetId:assetIds[1]},
  ]});
  assert.equal(cropped.status,200);assert.equal(cropped.body[0].isCover,true);assert.equal(cropped.body[0].crop.width,80);
  const check=await call('GET',`${root}/content/${created.body.id}/variants/${ig.id}/preflight`);
  assert.equal(check.status,200);assert.deepEqual(check.body.issues,[]);
  const accounts=(await call('GET',`${root}/accounts`)).body as Array<{id:string;platform:string}>;
  const selected=accounts.filter(account=>['FACEBOOK','INSTAGRAM','TIKTOK'].includes(account.platform));
  for(const account of selected){
    const variant=variants.body.find((row:{platform:string})=>row.platform===account.platform);
    assert.equal((await call('PATCH',`${root}/content/${created.body.id}/variants/${variant.id}`,{status:'READY'})).status,200);
    assert.equal((await call('POST',`${root}/accounts/${account.id}/credentials`,{accessToken:`token-${account.id}`})).status,200);
  }
  const published=await call('POST',`${root}/publish`,{contentId:created.body.id,socialAccountIds:selected.map(account=>account.id)});
  assert.equal(published.status,201);
  assert.ok(published.body.results.every((result:{valid:boolean})=>result.valid));
  const worker=new LocalWorkerRuntime(app.repos,app.registry,app.services.media);
  assert.equal(await worker.tick(),3);
  const batch=await call('GET',`/publish/batches/${published.body.batchId}`);
  assert.equal(batch.body.status,'PUBLISHED');
});
