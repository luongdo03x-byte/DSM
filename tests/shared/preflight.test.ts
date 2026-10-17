import assert from 'node:assert/strict';
import {test} from 'node:test';
import {preflight, inferFormat} from '../../packages/shared/src/preflight.ts';
import {FACEBOOK_ALBUM_MAX, MEDIA_RULES} from '../../packages/shared/src/media-rules.ts';
import type {MediaFacts} from '../../packages/shared/src/media-rules.ts';

const photo: MediaFacts = {kind: 'IMAGE', mimeType: 'image/jpeg', width: 1080, height: 1350, sizeBytes: 100_000};
const album = (count: number) => Array.from({length: count}, () => photo);
const issue = (issues: ReturnType<typeof preflight>, code: string) => issues.find(item => item.code === code);

test('instagram album 12 ảnh lỗi IG_ALBUM_MAX', () => {
  const found = issue(preflight({platform: 'INSTAGRAM', format: 'ALBUM', hashtags: [], media: album(12)}), 'IG_ALBUM_MAX');
  assert.equal(found?.severity, 'error');
  assert.match(found?.message ?? '', /10/);
});

test('instagram 6 hashtag lỗi IG_HASHTAG_MAX', () => {
  assert.equal(issue(preflight({platform: 'INSTAGRAM', format: 'IMAGE', hashtags: ['a', 'b', 'c', 'd', 'e', 'f'], media: [photo]}), 'IG_HASHTAG_MAX')?.severity, 'error');
});

test('instagram ảnh PNG cảnh báo chuyển JPEG', () => {
  const issues = preflight({platform: 'INSTAGRAM', format: 'IMAGE', hashtags: [], media: [{...photo, mimeType: 'image/png'}]});
  assert.equal(issue(issues, 'IG_IMAGE_WILL_CONVERT')?.severity, 'warning');
  assert.equal(issues.some(item => item.severity === 'error'), false);
});

test('tiktok album 36 ảnh lỗi TT_ALBUM_MAX', () => {
  assert.equal(issue(preflight({platform: 'TIKTOK', format: 'ALBUM', hashtags: [], media: album(36)}), 'TT_ALBUM_MAX')?.severity, 'error');
  assert.equal(MEDIA_RULES.TIKTOK.imageSource, 'PULL_FROM_URL');
});

test('youtube tiêu đề 101 ký tự lỗi YT_TITLE_MAX và bỏ qua ảnh', () => {
  assert.equal(issue(preflight({platform: 'YOUTUBE', format: 'VIDEO', title: 'x'.repeat(101), hashtags: [], media: [{kind: 'VIDEO', mimeType: 'video/mp4', width: 1920, height: 1080, sizeBytes: 1_000_000, durationMs: 200_000}]}), 'YT_TITLE_MAX')?.severity, 'error');
  assert.deepEqual(inferFormat('YOUTUBE', 'IMAGE', [photo]), {skipped: 'YT_NO_IMAGE_API'});
});

test('video dọc 70 giây là SHORT; 200 giây là VIDEO', () => {
  const video: MediaFacts = {kind: 'VIDEO', mimeType: 'video/mp4', width: 1080, height: 1920, sizeBytes: 1_000_000, durationMs: 70_000};
  assert.deepEqual(inferFormat('YOUTUBE', 'VIDEO', [video]), {format: 'SHORT'});
  assert.deepEqual(inferFormat('YOUTUBE', 'VIDEO', [{...video, durationMs: 200_000}]), {format: 'VIDEO'});
});

test('facebook album 11 ảnh lỗi FB_ALBUM_MAX', () => {
  assert.equal(FACEBOOK_ALBUM_MAX, 10);
  assert.equal(issue(preflight({platform: 'FACEBOOK', format: 'ALBUM', hashtags: [], media: album(11)}), 'FB_ALBUM_MAX')?.severity, 'error');
});

test('văn bản thuần chỉ hợp lệ trên Facebook và Threads hiện có', () => {
  assert.deepEqual(inferFormat('FACEBOOK', 'TEXT', []), {format: 'TEXT'});
  for (const platform of ['INSTAGRAM', 'TIKTOK', 'YOUTUBE'] as const) assert.ok('skipped' in inferFormat(platform, 'TEXT', []));
});
