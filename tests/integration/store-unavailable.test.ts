import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {randomBytes} from 'node:crypto';
import type {AddressInfo} from 'node:net';
import {createDevelopmentRuntime} from '../../apps/api/src/runtime/dev-runtime.ts';
import {startApiServer} from '../../apps/api/src/main.ts';

test('local-api returns STORE_UNAVAILABLE when repository connection fails', async (t) => {
  const app = await createDevelopmentRuntime({env: {
    DEV_OWNER_EMAIL: 'owner@local.test',
    DEV_OWNER_PASSWORD: 'test-password',
    CREDENTIAL_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
    JWT_ACCESS_SECRET: 'test-jwt-secret',
  }});
  const server = startApiServer(0, app.runtime);
  t.after(() => new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
    server.closeAllConnections();
  }));
  await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const login = await fetch(`${base}/auth/login`, {method: 'POST', headers: {'content-type': 'application/json'},
    body: JSON.stringify({email: 'owner@local.test', password: 'test-password'})});
  assert.equal(login.status, 200);
  const token = (await login.json() as {accessToken: string}).accessToken;
  app.repos.products.findBy = async () => {throw Object.assign(new Error('connect ECONNREFUSED'), {code: 'ECONNREFUSED'})};
  const response = await fetch(`${base}/brands/local-brand/products`, {headers: {authorization: `Bearer ${token}`}});
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {error: 'STORE_UNAVAILABLE'});
});
