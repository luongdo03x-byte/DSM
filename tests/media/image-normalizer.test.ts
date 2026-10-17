import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {test} from 'node:test';
import {normalizeImage} from '../../apps/worker/src/media/image-normalizer.ts';

const require = createRequire(new URL('../../apps/worker/package.json', import.meta.url));
const sharp = require('sharp') as typeof import('../../apps/worker/node_modules/sharp/lib/index.js');
const fixture = (name:string) => readFile(join(import.meta.dirname, '../fixtures/media', name));
const target = {maxBytes: 300_000, maxLongEdge: 1600};

test('PNG và HEIC được chuẩn hóa thành JPEG', async () => {
  for (const name of ['sample.png', 'sample.heic']) {
    const result = await normalizeImage(await fixture(name), target);
    assert.equal(result.mimeType, 'image/jpeg');
    assert.equal((await sharp(result.buffer).metadata()).format, 'jpeg');
    assert.ok(result.width > 0 && result.height > 0);
  }
});

test('ảnh JPEG chuẩn hóa bỏ EXIF', async () => {
  const source = await fixture('gps.jpg');
  assert.ok((await sharp(source).metadata()).exif);
  const result = await normalizeImage(source, target);
  assert.equal((await sharp(result.buffer).metadata()).exif, undefined);
});

test('ảnh vuông cắt thành 4:5', async () => {
  const result = await normalizeImage(await fixture('sample.png'), {...target, aspect: {w: 4, h: 5}});
  assert.ok(Math.abs(result.width / result.height - 0.8) < 0.01);
});

test('ảnh lớn được nén dưới maxBytes', async () => {
  const width = 1200;
  const height = 1200;
  const bytes = Buffer.alloc(width * height * 3);
  let state = 123456789;
  for (let i = 0; i < bytes.length; i++) {state ^= state << 13; state ^= state >>> 17; state ^= state << 5; bytes[i] = state & 255;}
  const input = await sharp(bytes, {raw: {width, height, channels: 3}}).png().toBuffer();
  const result = await normalizeImage(input, target);
  assert.ok(result.buffer.length <= target.maxBytes, `output ${result.buffer.length} bytes`);
});
