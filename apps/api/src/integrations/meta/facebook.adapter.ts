import type {PlatformAdapter,AdapterCapabilities,TokenRefreshResult} from '../../../../../packages/platform-contracts/src/adapter.ts';
import {PublishError} from '../../../../../packages/platform-contracts/src/index.ts';
import type {PublishInput,PublishResult,PublishedPostData,PostMetricsData,ValidationResult} from '../../../../../packages/platform-contracts/src/index.ts';
import type {SocialAccount} from '../../../../../packages/shared/src/domain.ts';
import {MEDIA_RULES} from '../../../../../packages/shared/src/media-rules.ts';
import {MetaGraphClient} from './meta-http.client.ts';

type Deps={graph:MetaGraphClient;tokens:(socialAccountId:string)=>Promise<string>;refresh?:(account:SocialAccount)=>Promise<TokenRefreshResult>};
export class FacebookAdapter implements PlatformAdapter {
  readonly platform='FACEBOOK' as const;
  private readonly graph:MetaGraphClient;private readonly tokens:Deps['tokens'];private readonly refresh:Deps['refresh'];
  constructor(deps:Deps){this.graph=deps.graph;this.tokens=deps.tokens;this.refresh=deps.refresh}
  capabilities(_account:SocialAccount):AdapterCapabilities{return {platform:this.platform,rule:MEDIA_RULES.FACEBOOK}}
  async refreshToken(account:SocialAccount):Promise<TokenRefreshResult>{return this.refresh?this.refresh(account):{refreshed:false}}
  async validate(input:PublishInput):Promise<ValidationResult>{
    const errors:string[]=[];const format=String(input.metadata?.format??(input.contentType==='ALBUM'?'ALBUM':input.contentType));
    if(!MEDIA_RULES.FACEBOOK.formats.includes(format as any))errors.push('FORMAT_UNSUPPORTED');
    if(format==='ALBUM'&&(!input.media||input.media.length<2||input.media.length>10||input.media.some(x=>x.kind!=='IMAGE')))errors.push('FB_ALBUM_INVALID');
    if(['IMAGE','VIDEO','REEL'].includes(format)&&!input.media?.[0]?.url&&!input.mediaUrl)errors.push('MEDIA_REQUIRED');
    return {valid:errors.length===0,errors,warnings:[]};
  }
  async publish(input:PublishInput):Promise<PublishResult>{
    const validation=await this.validate(input);if(!validation.valid)throw new PublishError({type:'VALIDATION_ERROR',code:validation.errors[0]!,message:validation.errors[0]!,retryable:false});
    const token=await this.tokens(input.socialAccountId),page=String(input.metadata?.pageId??input.socialAccountId);
    const format=String(input.metadata?.format??(input.contentType==='ALBUM'?'ALBUM':input.contentType));
    const message=input.body??input.caption??'';
    if(input.metadata?.retrySince){
      const since=String(input.metadata.retrySince);
      const recent=await this.graph.get<{data?:Array<{id:string;message?:string}>}>(`/${page}/published_posts`,token,{since,fields:'message,id'});
      const match=message?recent.data?.find(post=>post.message===message):undefined;
      if(match)return {externalPostId:match.id,externalUrl:`https://facebook.com/${match.id}`,publishedAt:Date.now()};
      if(!['TEXT','LINK'].includes(format))throw new PublishError({type:'NETWORK_ERROR',code:'FB_OUTCOME_UNKNOWN',message:'Remote media outcome is unknown; reconcile manually before publishing again',retryable:false});
    }
    const url=input.media?.[0]?.url??input.mediaUrl;
    if(format==='TEXT'||format==='LINK'){
      const link=String(input.metadata?.link??'');
      const result=await this.graph.post<{id:string}>(`/${page}/feed`,token,{message,...(format==='LINK'&&link?{link}:{})});
      return this.published(result.id);
    }
    if(format==='IMAGE'){
      const result=await this.graph.post<{id:string;post_id?:string}>(`/${page}/photos`,token,{url,caption:message});
      return this.published(result.post_id??result.id);
    }
    if(format==='ALBUM'){
      const uploaded:string[]=[];
      for(const media of input.media??[]){const photo=await this.graph.post<{id:string}>(`/${page}/photos`,token,{url:media.url,published:false});uploaded.push(photo.id)}
      const result=await this.graph.post<{id:string}>(`/${page}/feed`,token,{message,attached_media:uploaded.map(media_fbid=>({media_fbid}))});
      return this.published(result.id);
    }
    if(format==='VIDEO'){
      const result=await this.graph.post<{id?:string;video_id?:string}>(`/${page}/videos`,token,{file_url:url,description:message});
      return {remoteCorrelationId:String(result.video_id??result.id),processing:true};
    }
    const started=await this.graph.post<{video_id:string;upload_url:string}>(`/${page}/video_reels`,token,{upload_phase:'start'});
    try{
      await this.graph.uploadHostedVideo(started.upload_url,token,url!);
      await this.graph.post(`/${page}/video_reels`,token,{upload_phase:'finish',video_id:started.video_id,video_state:'PUBLISHED',description:message});
    }catch(error){if(error instanceof PublishError&&error.type==='NETWORK_ERROR')throw new PublishError({type:'NETWORK_ERROR',code:'FB_REEL_OUTCOME_UNKNOWN',message:'Facebook Reel outcome is unknown; reconcile manually before retrying',retryable:false});throw error}
    return {remoteCorrelationId:started.video_id,processing:true};
  }
  private published(id:string):PublishResult{return {externalPostId:String(id),externalUrl:`https://facebook.com/${id}`,publishedAt:Date.now()}}
  async pollStatus(input:{socialAccountId:string;remoteCorrelationId:string}):Promise<PublishResult>{
    const token=await this.tokens(input.socialAccountId),post=await this.graph.get<{id?:string;status?:{video_status?:string};permalink_url?:string}>(`/${input.remoteCorrelationId}`,token,{fields:'id,status,permalink_url'});
    if(post.status?.video_status&&post.status.video_status!=='ready')return {remoteCorrelationId:input.remoteCorrelationId,processing:true};
    return {externalPostId:post.id??input.remoteCorrelationId,remoteCorrelationId:input.remoteCorrelationId,...(post.permalink_url?{externalUrl:post.permalink_url}:{}),publishedAt:Date.now()};
  }
  async fetchPost(postId:string,context?:{socialAccountId?:string}):Promise<PublishedPostData>{
    if(!context?.socialAccountId)throw new Error('ACCOUNT_CONTEXT_REQUIRED');const token=await this.tokens(context.socialAccountId);
    const data=await this.graph.get<{id?:string;permalink_url?:string;created_time?:string}>(`/${postId}`,token,{fields:'id,permalink_url,created_time'});
    return {externalPostId:data.id??postId,exists:!!data.id,...(data.permalink_url?{externalUrl:data.permalink_url}:{}),...(data.created_time?{publishedAt:Date.parse(data.created_time)}:{})};
  }
  async fetchMetrics(postId:string,context?:{socialAccountId?:string}):Promise<PostMetricsData>{
    if(!context?.socialAccountId)throw new Error('ACCOUNT_CONTEXT_REQUIRED');const token=await this.tokens(context.socialAccountId);
    const data=await this.graph.get<{likes?:{summary?:{total_count?:number}};comments?:{summary?:{total_count?:number}};shares?:{count?:number}}>(`/${postId}`,token,{fields:'likes.summary(true),comments.summary(true),shares'});
    return {likes:data.likes?.summary?.total_count,comments:data.comments?.summary?.total_count,shares:data.shares?.count,raw:data};
  }
}
