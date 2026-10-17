import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {randomBytes} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import type {AddressInfo} from 'node:net';
import {createDevelopmentRuntime} from '../../apps/api/src/runtime/dev-runtime.ts';
import {startApiServer} from '../../apps/api/src/main.ts';
import {LocalWorkerRuntime, metricsCaptureKey} from '../../apps/worker/src/runtime/local-worker.ts';
import {FakePublisher} from '../../apps/worker/src/testing/fake-publisher.ts';

const BRAND = 'local-brand';
const OWNER_EMAIL = 'smoke-owner@dsm.test';
const OWNER_PASSWORD = 'smoke-owner-password';
const PLATFORMS = ['FACEBOOK', 'INSTAGRAM', 'THREADS', 'TIKTOK'] as const;
const LANDING_URL = 'https://shop.test/dog-brush';

interface CallOptions {
  token?: string;
  body?: unknown;
  headers?: Record<string, string>;
}
interface CallResult {
  status: number;
  headers: Headers;
  body: any;
}

function cookiePair(setCookie: string) {
  return setCookie.split(';')[0] ?? '';
}

test('http api smoke journey', async (t) => {
  const originalFetch = globalThis.fetch;
  const externalHosts: string[] = [];
  globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.hostname !== '127.0.0.1') {
      externalHosts.push(url.host);
      throw new Error(`SMOKE_EXTERNAL_FETCH_BLOCKED:${url.host}`);
    }
    return originalFetch(input, init);
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const env = {
    DEV_OWNER_EMAIL: OWNER_EMAIL,
    DEV_OWNER_PASSWORD: OWNER_PASSWORD,
    CREDENTIAL_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
    JWT_ACCESS_SECRET: `smoke-jwt-${randomBytes(16).toString('hex')}`,
  };
  const app = await createDevelopmentRuntime({env});
  for (const platform of PLATFORMS) app.registry.register(platform, 'API', new FakePublisher());
  const worker = new LocalWorkerRuntime(app.repos, app.registry, app.services.media);

  const server = startApiServer(0, app.runtime);
  t.after(
    () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      }),
  );
  await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  async function call(method: string, path: string, options: CallOptions = {}): Promise<CallResult> {
    const headers: Record<string, string> = {...options.headers};
    if (options.token !== undefined) headers.authorization = `Bearer ${options.token}`;
    const init: RequestInit = {method, headers, redirect: 'manual'};
    if (options.body !== undefined) {
      headers['content-type'] = 'application/json';
      init.body = JSON.stringify(options.body);
    }
    const response = await fetch(`${base}${path}`, init);
    const text = await response.text();
    return {status: response.status, headers: response.headers, body: text ? JSON.parse(text) : null};
  }

  // 1. Health
  const health = await call('GET', '/health');
  assert.equal(health.status, 200);

  // 2. Brand route without a token
  const anonymous = await call('GET', `/brands/${BRAND}/products`);
  assert.equal(anonymous.status, 401);

  // 3. Wrong password
  const wrongPassword = await call('POST', '/auth/login', {body: {email: OWNER_EMAIL, password: 'wrong-password'}});
  assert.equal(wrongPassword.status, 401);

  // 4. Login: access token in body, refresh token only in an HttpOnly cookie
  const login = await call('POST', '/auth/login', {body: {email: OWNER_EMAIL, password: OWNER_PASSWORD}});
  assert.equal(login.status, 200);
  assert.equal(typeof login.body.accessToken, 'string');
  assert.equal('refreshToken' in login.body, false);
  const setCookies = login.headers.getSetCookie();
  const refreshCookie = setCookies.find((cookie) => cookie.startsWith('refresh_token='));
  const csrfCookie = setCookies.find((cookie) => cookie.startsWith('csrf_token='));
  assert.ok(refreshCookie, 'refresh_token cookie is set');
  assert.match(refreshCookie, /;\s*HttpOnly(;|$)/);
  assert.match(refreshCookie, /;\s*SameSite=Lax(;|$)/);
  assert.match(refreshCookie, /;\s*Path=\/auth(;|$)/);
  assert.ok(csrfCookie, 'csrf_token cookie is set');

  // 5. Refresh needs both cookies and a matching x-csrf-token header
  const cookieHeader = `${cookiePair(refreshCookie)}; ${cookiePair(csrfCookie)}`;
  const csrfToken = decodeURIComponent(cookiePair(csrfCookie).slice('csrf_token='.length));
  const refreshWithoutHeader = await call('POST', '/auth/refresh', {headers: {cookie: cookieHeader}});
  assert.equal(refreshWithoutHeader.status, 403);
  assert.equal(refreshWithoutHeader.body.error, 'CSRF_MISMATCH');
  const refreshed = await call('POST', '/auth/refresh', {headers: {cookie: cookieHeader, 'x-csrf-token': csrfToken}});
  assert.equal(refreshed.status, 200);
  assert.equal(typeof refreshed.body.accessToken, 'string');
  assert.equal('refreshToken' in refreshed.body, false);
  const token: string = refreshed.body.accessToken;

  // 6. Product
  const product = await call('POST', `/brands/${BRAND}/products`, {
    token,
    body: {name: 'Dog Brush', slug: 'dog-brush', currency: 'USD', landingUrl: LANDING_URL, cost: '8', sellingPrice: '29'},
  });
  assert.equal(product.status, 201);

  // 7. Media upload (VIDEO)
  const upload = await call('POST', `/brands/${BRAND}/media/uploads`, {token, body: {type: 'VIDEO', mimeType: 'video/mp4'}});
  assert.equal(upload.status, 201);
  assert.equal(typeof upload.body.assetId, 'string');
  await app.services.media.storage.putObject(upload.body.storageKey,await readFile(join(import.meta.dirname,'../fixtures/media/vertical-3s.mp4')),'video/mp4');

  // 8. VIDEO content with masterAssetId
  const content = await call('POST', `/brands/${BRAND}/content`, {
    token,
    body: {type: 'VIDEO', title: 'Dog brush demo', productId: product.body.id, body: 'Demo', masterAssetId: upload.body.assetId},
  });
  assert.equal(content.status, 201);
  const contentId: string = content.body.id;

  // 9. Copy master to the four platform variants
  const variants = await call('POST', `/brands/${BRAND}/content/${contentId}/variants/copy`, {token});
  assert.equal(variants.status, 200);
  assert.equal(variants.body.length, 5);

  // 10. Four seeded social accounts
  const accounts = await call('GET', `/brands/${BRAND}/accounts`, {token});
  assert.equal(accounts.status, 200);
  assert.equal(accounts.body.length, 4);
  const accountIds: string[] = accounts.body.map((account: {id: string}) => account.id);

  // 11. Validation fails closed while variants are DRAFT
  const blocked = await call('POST', `/brands/${BRAND}/publish/validate`, {token, body: {contentId, socialAccountIds: accountIds}});
  assert.equal(blocked.status, 200);
  assert.equal(blocked.body.length, 4);
  for (const target of blocked.body) {
    assert.equal(target.valid, false);
    assert.ok(target.errors.includes('VARIANT_NOT_READY'));
  }

  // 12. Mark the four variants READY
  for (const variant of variants.body.filter((row: {skippedReason?: string}) => !row.skippedReason)) {
    const ready = await call('PATCH', `/brands/${BRAND}/content/${contentId}/variants/${variant.id}`, {token, body: {status: 'READY'}});
    assert.equal(ready.status, 200);
    assert.equal(ready.body.status, 'READY');
  }

  // 13. Store API credentials for the four accounts
  for (const accountId of accountIds) {
    const credential = await call('POST', `/brands/${BRAND}/accounts/${accountId}/credentials`, {
      token,
      body: {accessToken: `smoke-token-${accountId}`},
    });
    assert.equal(credential.status, 200);
    assert.equal(credential.body.status, 'CONNECTED');
  }

  // 14. Validation passes for every target with the API strategy
  const validated = await call('POST', `/brands/${BRAND}/publish/validate`, {token, body: {contentId, socialAccountIds: accountIds}});
  assert.equal(validated.status, 200);
  assert.equal(validated.body.length, 4);
  for (const target of validated.body) {
    assert.equal(target.valid, true);
    assert.equal(target.strategy, 'API');
  }

  // 15. Publish batch
  const publish = await call('POST', `/brands/${BRAND}/publish`, {token, body: {contentId, socialAccountIds: accountIds}});
  assert.equal(publish.status, 201);
  const jobIds = publish.body.results.map((result: {jobId?: string}) => result.jobId).filter((jobId: unknown) => typeof jobId === 'string');
  assert.equal(jobIds.length, 4);

  // 16. Worker processes the four jobs
  assert.equal(await worker.tick(), 4);

  // 17. Batch status
  const batch = await call('GET', `/publish/batches/${publish.body.batchId}`, {token});
  assert.equal(batch.status, 200);
  assert.equal(batch.body.status, 'PUBLISHED');

  // 18. Calendar shows four PUBLISHED jobs
  const calendar = await call('GET', `/brands/${BRAND}/calendar`, {token});
  assert.equal(calendar.status, 200);
  assert.equal(calendar.body.length, 4);
  for (const job of calendar.body) assert.equal(job.status, 'PUBLISHED');

  // 19. Tracked link redirect
  const link = await call('POST', `/brands/${BRAND}/tracked-links`, {
    token,
    body: {targetUrl: LANDING_URL, productId: product.body.id, contentItemId: contentId},
  });
  assert.equal(link.status, 201);
  const redirect = await call('GET', `/r/${link.body.code}`);
  assert.equal(redirect.status, 302);
  assert.equal(redirect.headers.get('location'), LANDING_URL);

  // 20. Metrics sync for the four published posts
  assert.equal(await worker.syncMetrics(metricsCaptureKey()), 4);

  // 21. Analytics overview
  const overview = await call('GET', `/brands/${BRAND}/analytics/overview`, {token});
  assert.equal(overview.status, 200);
  assert.equal(overview.body.posts, 4);
  assert.equal(overview.body.views, 400);

  assert.deepEqual(externalHosts, []);
});
