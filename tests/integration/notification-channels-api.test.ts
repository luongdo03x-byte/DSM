import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {createDevelopmentRuntime} from '../../apps/api/src/runtime/dev-runtime.ts';

test('workspace owner configures notification destinations without exposing secrets',async()=>{
  const app=await createDevelopmentRuntime({env:{DEV_OWNER_PASSWORD:'secret',DEV_OWNER_EMAIL:'owner@notify.test',CREDENTIAL_ENCRYPTION_KEY:randomBytes(32).toString('base64')}});
  const login=await app.runtime.handle({method:'POST',path:'/auth/login',body:{email:'owner@notify.test',password:'secret'}});
  const headers={authorization:'Bearer '+(login.body as {accessToken:string}).accessToken};
  const created=await app.runtime.handle({method:'POST',path:'/brands/local-brand/notification-channels',headers,body:{kind:'TELEGRAM',target:'12345'}});
  assert.equal(created.status,201);const row=created.body as {id:string;workspaceId:string};assert.equal(row.workspaceId,app.ids.workspaceId);
  const listed=await app.runtime.handle({method:'GET',path:'/brands/local-brand/notification-channels',headers});
  assert.equal((listed.body as unknown[]).length,1);
  const disabled=await app.runtime.handle({method:'PATCH',path:`/brands/local-brand/notification-channels/${row.id}`,headers,body:{enabled:false}});
  assert.equal(disabled.status,200);assert.equal((disabled.body as {enabled:boolean}).enabled,false);
});
