import test from 'node:test';
import assert from 'node:assert/strict';
import {runV1CriticalJourney} from '../../apps/api/src/testing/v1-acceptance-harness.ts';

test('v1 acceptance harness', async () => {
  const result = await runV1CriticalJourney();

  assert.equal(result.loginOk, true);
  assert.equal(result.variants, 5);
  assert.equal(result.jobs, 4);
  assert.equal(result.publishedPosts, 4);
  assert.equal(result.batchStatus, 'PUBLISHED');
  assert.equal(result.redirect, 'https://shop.test/dog-brush?utm_source=social');
  assert.equal(result.analytics.posts, 4);
  assert.equal(result.analytics.views, 400);
  assert.equal(result.analytics.clicks, 1);
  assert.equal(result.analytics.platforms.length, 4);
});
