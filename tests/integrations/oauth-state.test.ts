import assert from 'node:assert/strict';
import {test} from 'node:test';
import {OAUTH_STATE_TTL_MS,signState,verifyState} from '../../apps/api/src/modules/integrations/oauth-state.ts';

const payload={brandId:'brand-1',userId:'user-1',provider:'META',nonce:'nonce-123'};
const secret='a-local-test-secret-with-32-chars';
const now=1_800_000_000_000;

test('state hợp lệ được giải đúng',()=>{
  const token=signState(payload,secret,now);
  assert.deepEqual(verifyState(token,secret,now+OAUTH_STATE_TTL_MS-1),payload);
});

test('state sửa một ký tự ném OAUTH_STATE_INVALID',()=>{
  const token=signState(payload,secret,now);
  const last=token.at(-1)==='a'?'b':'a';
  assert.throws(()=>verifyState(token.slice(0,-1)+last,secret,now),/OAUTH_STATE_INVALID/);
});

test('state quá 10 phút ném OAUTH_STATE_EXPIRED',()=>{
  const token=signState(payload,secret,now);
  assert.throws(()=>verifyState(token,secret,now+OAUTH_STATE_TTL_MS+1),/OAUTH_STATE_EXPIRED/);
});
