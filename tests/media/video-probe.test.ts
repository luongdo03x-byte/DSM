import assert from 'node:assert/strict';
import {join} from 'node:path';
import {test} from 'node:test';
import {probeVideo} from '../../apps/worker/src/media/video-probe.ts';

test('ffprobe đọc video dọc 3 giây H.264', async () => {
  const facts = await probeVideo(join(import.meta.dirname, '../fixtures/media/vertical-3s.mp4'));
  assert.ok(Math.abs(facts.durationMs - 3000) <= 100);
  assert.equal(facts.width, 1080);
  assert.equal(facts.height, 1920);
  assert.equal(facts.codec, 'h264');
});
