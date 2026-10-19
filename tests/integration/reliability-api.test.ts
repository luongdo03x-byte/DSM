import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {createDevelopmentRuntime} from '../../apps/api/src/runtime/dev-runtime.ts';

test('reliability endpoint returns empty rate without fake metrics',async()=>{
  const app=await createDevelopmentRuntime({env:{DEV_OWNER_PASSWORD:'secret',DEV_OWNER_EMAIL:'owner@reliability.test',CREDENTIAL_ENCRYPTION_KEY:randomBytes(32).toString('base64')}});
  const login=await app.runtime.handle({method:'POST',path:'/auth/login',body:{email:'owner@reliability.test',password:'secret'}});
  const headers={authorization:'Bearer '+(login.body as {accessToken:string}).accessToken};
  const response=await app.runtime.handle({method:'GET',path:'/brands/local-brand/analytics/reliability',query:{days:'28'},headers});
  assert.equal(response.status,200);
  assert.deepEqual(response.body,{published:0,failedPlatform:0,failedUser:0,successRate:null});
});
