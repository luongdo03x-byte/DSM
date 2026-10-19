import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {createRuntime} from '../../apps/api/src/runtime/dev-runtime.ts';
import {FakePublisher} from '../../apps/worker/src/testing/fake-publisher.ts';

const base={DEV_IN_MEMORY:'1',DEV_OWNER_PASSWORD:'secret',CREDENTIAL_ENCRYPTION_KEY:randomBytes(32).toString('base64'),E2E_FAKE_PUBLISHERS:'1'};
test('E2E fake publishers are rejected outside test environment',async()=>{
  await assert.rejects(createRuntime({env:{...base,APP_ENV:'development'}}),{message:'E2E_FAKE_PUBLISHERS_REQUIRES_TEST_ENV'});
});
test('E2E fake publishers connect test accounts only in test environment',async()=>{
  const app=await createRuntime({env:{...base,APP_ENV:'test'}});
  try{
    const accounts=await app.repos.socialAccounts.findBy({brandId:'local-brand'});
    assert.equal(accounts.find(x=>x.platform==='FACEBOOK')?.status,'CONNECTED');
    assert.equal(accounts.find(x=>x.platform==='INSTAGRAM')?.status,'CONNECTED');
    assert.ok(app.registry.get('FACEBOOK','API') instanceof FakePublisher);
  }finally{await app.close()}
});
