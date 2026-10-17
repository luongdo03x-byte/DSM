import {createRequire} from 'node:module';
import {mkdir, writeFile, readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {join} from 'node:path';

const require = createRequire(new URL('../apps/worker/package.json', import.meta.url));
const sharp = require('sharp');
const directory = join(import.meta.dirname, '../tests/fixtures/media');
await mkdir(directory, {recursive: true});

await writeFile(join(directory, 'sample.png'), await sharp({create: {width: 1080, height: 1080, channels: 3, background: '#6182a7'}}).png().toBuffer());
await writeFile(join(directory, 'gps.jpg'), await sharp({create: {width: 100, height: 100, channels: 3, background: '#c78b65'}})
  .withExif({IFD0: {Copyright: 'DSM fixture'}, GPS: {GPSLatitudeRef: 'N', GPSLongitudeRef: 'E'}})
  .jpeg().toBuffer());

// libheif's test fixture, fetched only when explicitly regenerating fixtures.
// https://github.com/strukturag/libheif/blob/master/tests/data/rainbow-451x461.heic
const heic = Buffer.from(await (await fetch('https://raw.githubusercontent.com/strukturag/libheif/master/tests/data/rainbow-451x461.heic')).arrayBuffer());
const digest = createHash('sha256').update(heic).digest('hex');
if (digest !== '4b2ce727f093944975f143ba2b39c4c64511b766d94552f8d51a755916e7f983') throw new Error('HEIC fixture SHA256 mismatch');
await writeFile(join(directory, 'sample.heic'), heic);

const result = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=1080x1920:rate=30', '-t', '3', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '42', '-pix_fmt', 'yuv420p', join(directory, 'vertical-3s.mp4')], {stdio: 'inherit'});
if (result.status !== 0) throw new Error(`ffmpeg failed: ${result.status}`);
for (const filename of ['sample.png', 'gps.jpg', 'sample.heic', 'vertical-3s.mp4']) {
  const bytes = (await readFile(join(directory, filename))).length;
  if (bytes >= 200_000) throw new Error(`${filename} is too large: ${bytes}`);
  console.log(`${filename}: ${bytes} bytes`);
}
