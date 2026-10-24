import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {createDevelopmentRuntime} from '../../apps/api/src/runtime/dev-runtime.ts';

test('composer draft can update content fields through PATCH',async()=>{
  const app=await createDevelopmentRuntime({env:{DEV_OWNER_PASSWORD:'secret',DEV_OWNER_EMAIL:'owner@draft.test',CREDENTIAL_ENCRYPTION_KEY:randomBytes(32).toString('base64')}});
  const login=await app.runtime.handle({method:'POST',path:'/auth/login',body:{email:'owner@draft.test',password:'secret'}});
  const headers={authorization:'Bearer '+(login.body as {accessToken:string}).accessToken};
  const created=await app.runtime.handle({method:'POST',path:'/brands/local-brand/content',headers,body:{type:'TEXT',title:'Nháp cũ'}});
  assert.equal(created.status,201);const id=(created.body as {id:string}).id;
  const changed=await app.runtime.handle({method:'PATCH',path:`/brands/local-brand/content/${id}`,headers,body:{title:'Nháp mới',body:'Nội dung đã sửa',hook:'Mở đầu'}});
  assert.equal(changed.status,200);
  assert.equal((await app.repos.contents.get(id))?.title,'Nháp mới');
  assert.equal((await app.repos.contents.get(id))?.body,'Nội dung đã sửa');
});

test('composer loads the ordered media of an existing album',async()=>{
  const app=await createDevelopmentRuntime({env:{DEV_OWNER_PASSWORD:'secret',DEV_OWNER_EMAIL:'owner@draft.test',CREDENTIAL_ENCRYPTION_KEY:randomBytes(32).toString('base64')}});
  const login=await app.runtime.handle({method:'POST',path:'/auth/login',body:{email:'owner@draft.test',password:'secret'}});
  const headers={authorization:'Bearer '+(login.body as {accessToken:string}).accessToken};
  const a=await app.repos.media.insert({id:'image-a',brandId:app.ids.brandId,workspaceId:app.ids.workspaceId,type:'IMAGE',mimeType:'image/png',storageKey:'a'});
  const b=await app.repos.media.insert({id:'image-b',brandId:app.ids.brandId,workspaceId:app.ids.workspaceId,type:'IMAGE',mimeType:'image/png',storageKey:'b'});
  const created=await app.runtime.handle({method:'POST',path:'/brands/local-brand/content',headers,body:{type:'ALBUM',title:'Album',mediaAssetIds:[a.id,b.id]}});
  const id=(created.body as {id:string}).id;
  const loaded=await app.runtime.handle({method:'GET',path:`/brands/local-brand/content/${id}`,headers});
  assert.equal(loaded.status,200);
  assert.deepEqual((loaded.body as {mediaAssetIds:string[]}).mediaAssetIds,[a.id,b.id]);
});

test('composer saves AI hook and caption on the selected platform variant',async()=>{
  const app=await createDevelopmentRuntime({env:{DEV_OWNER_PASSWORD:'secret',DEV_OWNER_EMAIL:'owner@draft.test',CREDENTIAL_ENCRYPTION_KEY:randomBytes(32).toString('base64')}});
  const login=await app.runtime.handle({method:'POST',path:'/auth/login',body:{email:'owner@draft.test',password:'secret'}});
  const headers={authorization:'Bearer '+(login.body as {accessToken:string}).accessToken};
  const created=await app.runtime.handle({method:'POST',path:'/brands/local-brand/content',headers,body:{type:'TEXT',title:'Nháp AI'}});
  const contentId=(created.body as {id:string}).id;
  const copied=await app.runtime.handle({method:'POST',path:`/brands/local-brand/content/${contentId}/variants/copy`,headers});
  const variant=(copied.body as Array<{id:string;platform:string}>).find(row=>row.platform==='FACEBOOK')!;
  const saved=await app.runtime.handle({method:'PATCH',path:`/brands/local-brand/content/${contentId}/variants/${variant.id}`,headers,body:{hook:'Mở đầu AI',caption:'Chú thích AI',hashtags:['thu_nghiem']}});
  assert.equal(saved.status,200);
  const loaded=await app.runtime.handle({method:'GET',path:`/brands/local-brand/content/${contentId}/variants`,headers});
  assert.deepEqual((loaded.body as Array<{id:string;hook?:string;caption?:string;hashtags:string[]}>).find(row=>row.id===variant.id),{...(saved.body as object)});
  assert.equal((await app.repos.variants.get(variant.id))?.hook,'Mở đầu AI');
});
