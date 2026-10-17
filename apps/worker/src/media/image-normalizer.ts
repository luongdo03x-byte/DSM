import {createRequire} from 'node:module';
import sharp from 'sharp';
import type {CropBox} from '../../../../packages/shared/src/domain.ts';

export interface NormalizeTarget {
  aspect?: {w:number;h:number};
  crop?: CropBox;
  maxBytes: number;
  maxLongEdge: number;
}

const require = createRequire(import.meta.url);
const decodeHeic = require('heic-decode') as (input:{buffer:Buffer}) => Promise<{width:number;height:number;data:Uint8ClampedArray}>;

function isHeic(input:Buffer):boolean {
  return input.length > 12 && input.toString('ascii', 4, 8) === 'ftyp' && /^(heic|heix|hevc|hevx|mif1|msf1)$/.test(input.toString('ascii', 8, 12));
}

function validate(target:NormalizeTarget):void {
  if (!Number.isFinite(target.maxBytes) || target.maxBytes <= 0 || !Number.isFinite(target.maxLongEdge) || target.maxLongEdge <= 0) throw new Error('Invalid image limits');
  if (target.aspect && (!(target.aspect.w > 0) || !(target.aspect.h > 0))) throw new Error('Invalid aspect ratio');
  if (target.crop) {
    const {x,y,width,height} = target.crop;
    if (![x,y,width,height].every(Number.isFinite) || x < 0 || y < 0 || width <= 0 || height <= 0 || x + width > 100 || y + height > 100) throw new Error('Invalid crop box');
  }
}

function box(width:number, height:number, target:NormalizeTarget) {
  let left = 0, top = 0, boxWidth = width, boxHeight = height;
  if (target.crop) {
    left = Math.floor(width * target.crop.x / 100);
    top = Math.floor(height * target.crop.y / 100);
    boxWidth = Math.min(width - left, Math.max(1, Math.round(width * target.crop.width / 100)));
    boxHeight = Math.min(height - top, Math.max(1, Math.round(height * target.crop.height / 100)));
  }
  if (target.aspect) {
    const ratio = target.aspect.w / target.aspect.h;
    if (boxWidth / boxHeight > ratio) {
      const next = Math.max(1, Math.round(boxHeight * ratio));
      left += Math.floor((boxWidth - next) / 2);
      boxWidth = next;
    } else {
      const next = Math.max(1, Math.round(boxWidth / ratio));
      top += Math.floor((boxHeight - next) / 2);
      boxHeight = next;
    }
  }
  return {left, top, width:boxWidth, height:boxHeight};
}

export async function normalizeImage(input:Buffer, target:NormalizeTarget):Promise<{buffer:Buffer;width:number;height:number;mimeType:'image/jpeg'}> {
  validate(target);
  let source:Buffer;
  if (isHeic(input)) {
    const decoded = await decodeHeic({buffer:input});
    source = await sharp(Buffer.from(decoded.data), {raw:{width:decoded.width,height:decoded.height,channels:4}}).png().toBuffer();
  } else {
    source = input;
  }
  // Materialize the oriented pixels so the crop coordinates use displayed dimensions.
  const oriented = await sharp(source).rotate().toBuffer();
  const metadata = await sharp(oriented).metadata();
  if (!metadata.width || !metadata.height) throw new Error('Image has no dimensions');
  const crop = box(metadata.width, metadata.height, target);
  const longest = Math.max(crop.width, crop.height);
  let scale = Math.min(1, target.maxLongEdge / longest);
  for (let attempt = 0; attempt < 12; attempt++) {
    const width = Math.max(1, Math.round(crop.width * scale));
    const height = Math.max(1, Math.round(crop.height * scale));
    for (const quality of [90, 80, 70, 60]) {
      const buffer = await sharp(oriented).extract(crop).resize(width, height).jpeg({quality}).toBuffer();
      if (buffer.length <= target.maxBytes) return {buffer,width,height,mimeType:'image/jpeg'};
    }
    scale *= 0.8;
  }
  throw new Error('Cannot fit image within maxBytes');
}
