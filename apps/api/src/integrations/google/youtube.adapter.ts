import type {PlatformAdapter,AdapterCapabilities,TokenRefreshResult} from '../../../../../packages/platform-contracts/src/adapter.ts';
import {PublishError} from '../../../../../packages/platform-contracts/src/index.ts';
import type {PublishInput,PublishResult,PublishedPostData,PostMetricsData,ValidationResult} from '../../../../../packages/platform-contracts/src/index.ts';
import type {SocialAccount} from '../../../../../packages/shared/src/domain.ts';
import {MEDIA_RULES} from '../../../../../packages/shared/src/media-rules.ts';
import type {HttpClient} from '../../../../../packages/shared/src/http.ts';
import type {ObjectStorage} from '../../modules/media/media.service.ts';
import type {QuotaManager} from '../../../../../packages/shared/src/quota.ts';
import {queryProgress,sendChunks,startResumable,type ResumableSession} from './resumable-upload.ts';

type Deps={baseUrl:string;http:HttpClient;tokens:(id:string)=>Promise<string>;storage:ObjectStorage;audited:boolean;quota?:QuotaManager;dailyUploadLimit?:number;refresh?:(account:SocialAccount)=>Promise<TokenRefreshResult>};
type Settings={categoryId?:string;tags?:string[];privacyStatus?:'public'|'unlisted'|'private';playlistId?:string;madeForKids?:boolean};
export class YouTubeAdapter implements PlatformAdapter{
  readonly platform='YOUTUBE' as const;
  private readonly deps:Deps;
  constructor(deps:Deps){this.deps=deps}
  capabilities(_account:SocialAccount):AdapterCapabilities{return{platform:this.platform,rule:MEDIA_RULES.YOUTUBE,dailyPublishLimit:100}}
  async refreshToken(account:SocialAccount):Promise<TokenRefreshResult>{return this.deps.refresh?this.deps.refresh(account):{refreshed:false}}
  async validate(input:PublishInput):Promise<ValidationResult>{const errors:string[]=[];if(input.contentType!=='VIDEO'||input.media?.[0]?.kind!=='VIDEO')errors.push('YT_NO_IMAGE_API');if(!input.media?.[0]?.storageKey||!input.media?.[0]?.sizeBytes)errors.push('YT_MEDIA_STORAGE_REQUIRED');const settings=input.metadata?.youtube as Settings|undefined;if(settings?.madeForKids===undefined)errors.push('YT_MADE_FOR_KIDS_REQUIRED');return{valid:errors.length===0,errors,warnings:[]}}
  async publish(input:PublishInput):Promise<PublishResult>{
    const validation=await this.validate(input);if(!validation.valid)throw new PublishError({type:'VALIDATION_ERROR',code:validation.errors[0]!,message:validation.errors[0]!,retryable:false});
    const media=input.media![0]!,settings=input.metadata!.youtube as Settings,token=await this.deps.tokens(input.socialAccountId);
    const privacyStatus=this.deps.audited?settings.privacyStatus??'private':'private';
    const metadata={snippet:{title:input.caption??'',description:input.body??'',tags:settings.tags??[],categoryId:settings.categoryId??'22'},status:{privacyStatus,selfDeclaredMadeForKids:settings.madeForKids}};
    let session:ResumableSession;
    if(input.remoteCorrelationId?.startsWith('resumable:'))session=await queryProgress({uploadUrl:input.remoteCorrelationId.slice(10),totalBytes:media.sizeBytes!,confirmedBytes:0},token,this.deps.http);
    else{if(this.deps.quota){const allowed=await this.deps.quota.tryConsume('YOUTUBE',input.brandId,this.deps.dailyUploadLimit??100);if(!allowed.ok)throw new PublishError({type:'RATE_LIMIT',code:'YT_DAILY_UPLOAD_LIMIT',message:'Hết hạn mức tải video YouTube hôm nay',retryable:true,retryAfterMs:Math.max(0,allowed.retryAt-Date.now())})}session=await startResumable({baseUrl:this.deps.baseUrl,token,metadata,totalBytes:media.sizeBytes!,mimeType:media.mimeType,http:this.deps.http});await input.persistCorrelation?.(`resumable:${session.uploadUrl}`)}
    const read=async(start:number,end:number)=>this.deps.storage.getObjectRange?this.deps.storage.getObjectRange(media.storageKey!,start,end):(await this.deps.storage.getObject(media.storageKey!)).subarray(start,end+1);
    const result=session.videoId?{videoId:session.videoId}:await sendChunks(session,read,{chunkBytes:8*1024*1024,token,http:this.deps.http});
    if('session' in result)throw new PublishError({type:'NETWORK_ERROR',code:'YT_UPLOAD_INTERRUPTED',message:'YouTube upload interrupted; resume saved session',retryable:true});
    const videoId=result.videoId,warnings:string[]=[];
    if(settings.playlistId){const response=await this.deps.http.request({url:`${this.deps.baseUrl}/youtube/v3/playlistItems?part=snippet`,method:'POST',headers:{authorization:`Bearer ${token}`},body:{snippet:{playlistId:settings.playlistId,resourceId:{kind:'youtube#video',videoId}}}});if(response.status>=400)warnings.push('Không thể thêm vào playlist')}
    if(input.metadata?.thumbnailStorageKey){const bytes=await this.deps.storage.getObject(String(input.metadata.thumbnailStorageKey));const response=await this.deps.http.request({url:`${this.deps.baseUrl}/upload/youtube/v3/thumbnails/set?videoId=${encodeURIComponent(videoId)}`,method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'image/jpeg'},body:bytes});if(response.status===403)warnings.push('Không thể đặt ảnh bìa');else if(response.status>=400)throw new PublishError({type:'PLATFORM_ERROR',code:'YT_THUMBNAIL_FAILED',message:'YouTube thumbnail failed',retryable:true})}
    return{externalPostId:videoId,externalUrl:`https://www.youtube.com/watch?v=${videoId}`,...(warnings.length?{note:warnings.join('; ')}:{})};
  }
  async pollStatus(input:{socialAccountId:string;remoteCorrelationId:string}):Promise<PublishResult>{return{externalPostId:input.remoteCorrelationId,processing:false,publishedAt:Date.now()}}
  async fetchPost(postId:string,_context?:{socialAccountId?:string}):Promise<PublishedPostData>{return{externalPostId:postId,exists:!postId.startsWith('resumable:')}}
  async fetchMetrics(_postId:string,_context?:{socialAccountId?:string}):Promise<PostMetricsData>{return{raw:{}}}
}
