import test from 'node:test';
import assert from 'node:assert/strict';
import {browserLogout} from '../../apps/web/src/lib/browser-runtime.ts';
import {browserSession} from '../../apps/web/src/features/auth/session.ts';

test('logout clears in-memory token only after successful server response',async()=>{
  const original=globalThis.fetch;
  try{
    let requestUrl='';
    globalThis.fetch=async(url,init)=>{
      requestUrl=String(url);
      assert.equal(init?.method,'POST');
      assert.equal(init?.credentials,'include');
      return new Response(null,{status:204});
    };
    browserSession.setAccessToken('access-example');
    await browserLogout();
    assert.ok(requestUrl.endsWith('/auth/logout'));
    assert.equal(browserSession.getAccessToken(),undefined);
  }finally{globalThis.fetch=original;browserSession.clear()}
});

test('logout keeps session when server cannot revoke refresh cookie',async()=>{
  const original=globalThis.fetch;
  try{
    globalThis.fetch=async()=>new Response(null,{status:500});
    browserSession.setAccessToken('still-authenticated');
    await assert.rejects(browserLogout(),/LOGOUT_FAILED/);
    assert.equal(browserSession.getAccessToken(),'still-authenticated');
  }finally{globalThis.fetch=original;browserSession.clear()}
});
