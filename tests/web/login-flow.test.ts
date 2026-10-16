import test from 'node:test';
import assert from 'node:assert/strict';
import {loginErrorMessage,nextBrandRoute} from '../../apps/web/src/features/auth/login-flow.ts';

test('login redirects to the first assigned brand',()=>{
  assert.equal(nextBrandRoute({brands:[{id:'local-brand'}]}),'/app/brands/local-brand/overview');
});
test('empty brand context produces a dedicated error',()=>{
  assert.throws(()=>nextBrandRoute({brands:[]}),/NO_BRAND/);
  assert.equal(loginErrorMessage(new Error('NO_BRAND')),'Tài khoản chưa được gán thương hiệu.');
});
test('invalid credentials are localized',()=>{
  assert.equal(loginErrorMessage(new Error('INVALID_CREDENTIALS')),'Email hoặc mật khẩu không đúng.');
});
test('expired refresh session asks for login again',()=>{
  assert.equal(loginErrorMessage(new Error('UNAUTHORIZED')),'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
});
