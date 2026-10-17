import type {ContentFormat, Platform} from './domain.ts';

export interface MediaFacts {
  kind: 'IMAGE' | 'VIDEO';
  mimeType: string;
  width: number;
  height: number;
  sizeBytes: number;
  durationMs?: number;
}

export interface PlatformRule {
  formats: ContentFormat[];
  imageMime: string[];
  albumMax?: number;
  hashtagMax?: number;
  captionMax: number;
  titleMax?: number;
  shortMaxSec?: number;
  videoMaxSec?: number;
  imageSource?: 'UPLOAD' | 'PULL_FROM_URL';
  supportsImage: boolean;
  imageAspect?: {w:number;h:number};
}

export const FACEBOOK_ALBUM_MAX = 10;

export const MEDIA_RULES: Record<Platform, PlatformRule> = {
  FACEBOOK: {formats: ['TEXT', 'LINK', 'IMAGE', 'ALBUM', 'VIDEO', 'REEL'], imageMime: ['image/jpeg', 'image/png', 'image/webp'],
    albumMax: FACEBOOK_ALBUM_MAX, captionMax: 63_206, supportsImage: true, imageSource: 'UPLOAD'},
  INSTAGRAM: {formats: ['IMAGE', 'ALBUM', 'REEL', 'STORY'], imageMime: ['image/jpeg'],
    albumMax: 10, hashtagMax: 5, captionMax: 2_200, supportsImage: true, imageSource: 'UPLOAD',imageAspect:{w:4,h:5}},
  THREADS: {formats: ['TEXT', 'LINK', 'IMAGE', 'VIDEO'], imageMime: ['image/jpeg', 'image/png', 'image/webp'],
    captionMax: 500, supportsImage: true, imageSource: 'UPLOAD'},
  TIKTOK: {formats: ['IMAGE', 'ALBUM', 'VIDEO'], imageMime: ['image/jpeg', 'image/png', 'image/webp'],
    albumMax: 35, captionMax: 2_200, supportsImage: true, imageSource: 'PULL_FROM_URL',imageAspect:{w:9,h:16}},
  YOUTUBE: {formats: ['VIDEO', 'SHORT'], imageMime: [], captionMax: 5_000, titleMax: 100, shortMaxSec: 180, supportsImage: false},
};
