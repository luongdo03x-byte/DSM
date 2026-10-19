import type {PlatformAdapter,AdapterCapabilities,TokenRefreshResult} from '../../../../../packages/platform-contracts/src/adapter.ts';
import {PublishError,type PublishInput,type PublishResult,type PublishedPostData,type PostMetricsData,type ValidationResult} from '../../../../../packages/platform-contracts/src/index.ts';
import type {SocialAccount} from '../../../../../packages/shared/src/domain.ts';
import {MEDIA_RULES} from '../../../../../packages/shared/src/media-rules.ts';
import {TikTokHttpClient} from './tiktok-http.client.ts';
import {planChunks} from '../../modules/publishing/platforms/tiktok/tiktok-upload.service.ts';

export interface TikTokPostSettings{privacyLevel:string;disableComment:boolean;disableDuet:boolean;disableStitch:boolean;brandContentToggle:boolean;brandOrganicToggle:boolean}
export interface TikTokCreatorInfo{privacyLevelOptions:string[];maxVideoPostDurationSec:number;commentDisabled:boolean;duetDisabled:boolean;stitchDisabled:boolean}
type Deps={http:TikTokHttpClient;tokens:(socialAccountId:string)=>Promise<string>;auditApproved:boolean;publicMediaBaseUrl?:string;loadVideo?:(url:string)=>Promise<Uint8Array>;refresh?:(account:SocialAccount)=>Promise<TokenRefreshResult>};
const invalid=(code:string,message=code)=>new PublishError({type:'VALIDATION_ERROR',code,message,retryable:false});

export class TikTokAdapter implements PlatformAdapter{
  readonly platform='TIKTOK' as const;
  private readonly http:TikTokHttpClient;private readonly tokens:Deps['tokens'];private readonly auditApproved:boolean;private readonly loadVideo:NonNullable<Deps['loadVideo']>;private readonly refresh:Deps['refresh'];
  readonly publicMediaBaseUrl:string|undefined;
  constructor(deps:Deps){this.http=deps.http;this.tokens=deps.tokens;this.auditApproved=deps.auditApproved;this.publicMediaBaseUrl=deps.publicMediaBaseUrl;this.loadVideo=deps.loadVideo??(async url=>new Uint8Array(await(await fetch(url)).arrayBuffer()));this.refresh=deps.refresh}
  capabilities(_account:SocialAccount):AdapterCapabilities{return{platform:this.platform,rule:MEDIA_RULES.TIKTOK}}
  refreshToken(account:SocialAccount):Promise<TokenRefreshResult>{return this.refresh?this.refresh(account):Promise.resolve({refreshed:false})}
  private settings(input:PublishInput):TikTokPostSettings{
    const value=input.metadata?.tiktok as Partial<TikTokPostSettings>|undefined;
    if(!value?.privacyLevel)throw invalid('TT_PRIVACY_REQUIRED','Hãy chọn quyền riêng tư cho bài TikTok');
    for(const key of ['disableComment','disableDuet','disableStitch','brandContentToggle','brandOrganicToggle'] as const)if(typeof value[key]!=='boolean')throw invalid('TT_SETTINGS_REQUIRED');
    return value as TikTokPostSettings;
  }
  async creatorInfo(accountId:string):Promise<TikTokCreatorInfo>{
    const token=await this.tokens(accountId),raw=await this.http.api('/v2/post/publish/creator_info/query/',token,'POST',{},accountId),value=raw.data??raw;
    return{privacyLevelOptions:value.privacy_level_options??[],maxVideoPostDurationSec:Number(value.max_video_post_duration_sec??0),commentDisabled:Boolean(value.comment_disabled),duetDisabled:Boolean(value.duet_disabled),stitchDisabled:Boolean(value.stitch_disabled)};
  }
  private async checkedSettings(input:PublishInput):Promise<TikTokPostSettings>{
    const settings=this.settings(input);
    if(!this.auditApproved&&settings.privacyLevel!=='SELF_ONLY')throw invalid('TT_UNAUDITED_PRIVATE_ONLY','App chưa được TikTok duyệt: bài chỉ đăng ở chế độ riêng tư');
    const info=await this.creatorInfo(input.socialAccountId);
    if(!info.privacyLevelOptions.includes(settings.privacyLevel))throw invalid('TT_PRIVACY_NOT_ALLOWED');
    if((info.commentDisabled&&!settings.disableComment)||(info.duetDisabled&&!settings.disableDuet)||(info.stitchDisabled&&!settings.disableStitch))throw invalid('TT_SETTINGS_OUTDATED','Cài đặt TikTok đã thay đổi, hãy kiểm tra lại');
    const duration=(input.media?.find(item=>item.kind==='VIDEO')?.durationMs??0)/1000;
    if(info.maxVideoPostDurationSec&&duration>info.maxVideoPostDurationSec)throw invalid('TT_VIDEO_TOO_LONG');
    return settings;
  }
  async validate(input:PublishInput):Promise<ValidationResult>{try{await this.checkedSettings(input);if(!MEDIA_RULES.TIKTOK.formats.includes(String(input.metadata?.format??input.contentType) as any))throw invalid('TT_FORMAT_UNSUPPORTED');return{valid:true,errors:[],warnings:[]}}catch(error){if(error instanceof PublishError&&error.type==='VALIDATION_ERROR')return{valid:false,errors:[error.code],warnings:[]};throw error}}
  async publish(input:PublishInput):Promise<PublishResult>{
    if(input.contentType!=='VIDEO')throw invalid('TT_FORMAT_UNSUPPORTED');
    const settings=await this.checkedSettings(input),media=input.media?.find(item=>item.kind==='VIDEO')?.url??input.mediaUrl;if(!media)throw invalid('TT_VIDEO_REQUIRED');
    const bytes=await this.loadVideo(media);if(!bytes.byteLength)throw invalid('TT_VIDEO_REQUIRED');
    const chunks=planChunks(bytes.byteLength),token=await this.tokens(input.socialAccountId);
    const response=await this.http.api('/v2/post/publish/video/init/',token,'POST',{post_info:{title:input.caption??input.body??'',privacy_level:settings.privacyLevel,disable_comment:settings.disableComment,disable_duet:settings.disableDuet,disable_stitch:settings.disableStitch,brand_content_toggle:settings.brandContentToggle,brand_organic_toggle:settings.brandOrganicToggle},source_info:{source:'FILE_UPLOAD',video_size:bytes.byteLength,chunk_size:chunks[0]!.size,total_chunk_count:chunks.length}},input.socialAccountId);
    const data=response.data??response,publishId=String(data.publish_id??''),uploadUrl=String(data.upload_url??'');if(!publishId||!uploadUrl)throw new PublishError({type:'PLATFORM_ERROR',code:'TT_INIT_INCOMPLETE',message:'TikTok did not return upload details',retryable:false});
    for(const chunk of chunks){let failure:unknown;for(let attempt=0;attempt<3;attempt++){try{await this.http.upload(uploadUrl,bytes.slice(chunk.start,chunk.end+1),chunk.start,chunk.end,bytes.byteLength,input.socialAccountId);failure=undefined;break}catch(error){failure=error}}if(failure)throw failure}
    return{processing:true,remoteCorrelationId:publishId};
  }
  async pollStatus(input:{socialAccountId:string;remoteCorrelationId:string}):Promise<PublishResult>{return{remoteCorrelationId:input.remoteCorrelationId,processing:true}}
  async fetchPost(postId:string,_context?:{socialAccountId?:string}):Promise<PublishedPostData>{return{externalPostId:postId,exists:false}}
  async fetchMetrics(_postId:string,_context?:{socialAccountId?:string}):Promise<PostMetricsData>{return{raw:{}}}
}
