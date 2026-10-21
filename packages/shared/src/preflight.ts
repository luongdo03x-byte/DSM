import type {ContentFormat, ContentType, Platform,YouTubeVariantSettings} from './domain.ts';
import {MEDIA_RULES, type MediaFacts} from './media-rules.ts';

export interface PreflightIssue {
  code: string;
  severity: 'error' | 'warning';
  message: string;
  field?: 'caption' | 'title' | 'hashtags' | 'media' | 'description';
}

export interface PreflightInput {
  platform: Platform;
  format: ContentFormat;
  caption?: string;
  title?: string;
  description?:string;
  youtube?:YouTubeVariantSettings;
  hashtags: string[];
  media: MediaFacts[];
  mediaUrls?:string[];
  publicMediaBaseUrl?:string;
}

export function isPublicMediaUrl(value:string,base:string):boolean{
  try{const url=new URL(value),prefix=new URL(base);return url.protocol==='https:'&&prefix.protocol==='https:'&&url.origin===prefix.origin&&(url.pathname===prefix.pathname||url.pathname.startsWith(prefix.pathname.replace(/\/$/,'')+'/'))}catch{return false}
}

const prefix: Record<Platform, string> = {FACEBOOK: 'FB', INSTAGRAM: 'IG', THREADS: 'TH', TIKTOK: 'TT', YOUTUBE: 'YT'};

export function preflight(input: PreflightInput): PreflightIssue[] {
  const rule = MEDIA_RULES[input.platform], code = prefix[input.platform];
  const issues: PreflightIssue[] = [];
  const error = (suffix: string, message: string, field: PreflightIssue['field']) =>
    issues.push({code: `${code}_${suffix}`, severity: 'error', message, ...(field ? {field} : {})});
  if (!rule.formats.includes(input.format)) error('FORMAT_UNSUPPORTED', 'Nền tảng không hỗ trợ định dạng này.', 'media');
  if (rule.albumMax !== undefined && input.format === 'ALBUM' && input.media.length > rule.albumMax)
    error('ALBUM_MAX', `Album vượt quá ${rule.albumMax} ảnh cho phép.`, 'media');
  if(input.platform==='TIKTOK'&&(input.format==='IMAGE'||input.format==='ALBUM')&&input.publicMediaBaseUrl!==undefined){
    if(!input.publicMediaBaseUrl)error('MEDIA_DOMAIN_NOT_CONFIGURED','Chưa cấu hình domain media công khai cho TikTok.','media');
    else if(input.mediaUrls?.some(url=>!isPublicMediaUrl(url,input.publicMediaBaseUrl!)))error('MEDIA_URL_NOT_PUBLIC','Ảnh phải nằm trên domain media công khai đã xác minh với TikTok.','media');
  }
  if (rule.hashtagMax !== undefined && input.hashtags.length > rule.hashtagMax)
    error('HASHTAG_MAX', `Chỉ được dùng tối đa ${rule.hashtagMax} hashtag.`, 'hashtags');
  if (input.caption && input.caption.length > rule.captionMax)
    error('CAPTION_MAX', `Nội dung vượt quá ${rule.captionMax} ký tự.`, 'caption');
  if (rule.titleMax !== undefined && input.title && input.title.length > rule.titleMax)
    error('TITLE_MAX', `Tiêu đề vượt quá ${rule.titleMax} ký tự.`, 'title');
  if(input.platform==='YOUTUBE'){
    if(/[<>]/.test(input.description??''))error('DESCRIPTION_ANGLE_BRACKETS','Mô tả YouTube không được chứa dấu < hoặc >.','description');
    if((input.description?.length??0)>5000)error('DESCRIPTION_MAX','Mô tả YouTube vượt quá 5000 ký tự.','description');
    if((input.youtube?.tags??[]).join(',').length>500)error('TAGS_TOO_LONG','Tổng độ dài tag YouTube vượt quá 500 ký tự.','hashtags');
    if(typeof input.youtube?.madeForKids!=='boolean')error('MADE_FOR_KIDS_REQUIRED','Hãy chọn video có dành cho trẻ em hay không.','media');
  }
  for (const media of input.media) {
    if (media.kind === 'IMAGE' && !rule.supportsImage) error('NO_IMAGE_API', 'Nền tảng không hỗ trợ đăng ảnh.', 'media');
    if (input.platform === 'INSTAGRAM' && media.kind === 'IMAGE' && media.mimeType !== 'image/jpeg')
      issues.push({code: 'IG_IMAGE_WILL_CONVERT', severity: 'warning', message: 'Ảnh sẽ được chuyển sang JPEG trước khi đăng.', field: 'media'});
  }
  return issues;
}

export function inferFormat(platform: Platform, type: ContentType, media: MediaFacts[]): {format: ContentFormat} | {skipped: string} {
  if (type === 'TEXT') {
    return platform === 'FACEBOOK' || platform === 'THREADS' ? {format: 'TEXT'} : {skipped: `${prefix[platform]}_TEXT_UNSUPPORTED`};
  }
  if (type === 'IMAGE' || type === 'ALBUM') {
    if (platform === 'YOUTUBE') return {skipped: 'YT_NO_IMAGE_API'};
    if (platform === 'THREADS' && type === 'ALBUM') return {skipped: 'TH_ALBUM_UNSUPPORTED'};
    return {format: type};
  }
  const video = media.find(item => item.kind === 'VIDEO');
  const portrait = !!video && video.height > video.width;
  if (platform === 'YOUTUBE') return {format: portrait && (video?.durationMs ?? Infinity) <= 180_000 ? 'SHORT' : 'VIDEO'};
  if (platform === 'FACEBOOK') return {format: portrait ? 'REEL' : 'VIDEO'};
  if (platform === 'INSTAGRAM') return {format: 'REEL'};
  return {format: 'VIDEO'};
}
