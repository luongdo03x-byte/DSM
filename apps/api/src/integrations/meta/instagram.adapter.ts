import type {AdapterCapabilities,PlatformAdapter,TokenRefreshResult} from '../../../../../packages/platform-contracts/src/adapter.ts';
import {PublishError} from '../../../../../packages/platform-contracts/src/index.ts';
import type {PublishInput,PublishResult,PublishedPostData,PostMetricsData,ValidationResult} from '../../../../../packages/platform-contracts/src/index.ts';
import type {SocialAccount} from '../../../../../packages/shared/src/domain.ts';
import {MEDIA_RULES} from '../../../../../packages/shared/src/media-rules.ts';
import {MetaGraphClient} from './meta-http.client.ts';

export const IG_CONTAINER_TIMEOUT_MS=10*60_000;
type Deps={graph:MetaGraphClient;tokens:(socialAccountId:string)=>Promise<string>;accountIds:(socialAccountId:string)=>Promise<string>;refresh?:(account:SocialAccount)=>Promise<TokenRefreshResult>};
export class InstagramAdapter implements PlatformAdapter {
  readonly platform='INSTAGRAM' as const;
  private readonly graph:MetaGraphClient;private readonly tokens:Deps['tokens'];private readonly accountIds:Deps['accountIds'];private readonly refresh:Deps['refresh'];
  constructor(deps:Deps){this.graph=deps.graph;this.tokens=deps.tokens;this.accountIds=deps.accountIds;this.refresh=deps.refresh}
  capabilities(_account:SocialAccount):AdapterCapabilities{return{platform:this.platform,rule:MEDIA_RULES.INSTAGRAM,dailyPublishLimit:100}}
  async refreshToken(account:SocialAccount):Promise<TokenRefreshResult>{return this.refresh?this.refresh(account):{refreshed:false}}
  async validate(input:PublishInput):Promise<ValidationResult>{
    const format=String(input.metadata?.format??(input.contentType==='ALBUM'?'ALBUM':input.contentType==='VIDEO'?'REEL':'IMAGE'));
    const errors:string[]=[];if(!MEDIA_RULES.INSTAGRAM.formats.includes(format as any))errors.push('FORMAT_UNSUPPORTED');
    if(format==='ALBUM'&&(!input.media||input.media.length<2||input.media.length>10||input.media.some(x=>x.kind!=='IMAGE')))errors.push('IG_ALBUM_INVALID');
    if(!input.media?.[0]?.url&&!input.mediaUrl)errors.push('MEDIA_REQUIRED');
    return{valid:errors.length===0,errors,warnings:[]};
  }
  async publish(input:PublishInput):Promise<PublishResult>{
    const valid=await this.validate(input);if(!valid.valid)throw new PublishError({type:'VALIDATION_ERROR',code:valid.errors[0]!,message:valid.errors[0]!,retryable:false});
    const token=await this.tokens(input.socialAccountId),igId=String(input.metadata?.platformAccountId??await this.accountIds(input.socialAccountId));
    const limit=await this.graph.get<{data?:Array<{quota_usage?:number;config?:{quota_total?:number}}>}>(`/${igId}/content_publishing_limit`,token);
    const usage=limit.data?.[0]?.quota_usage??0,total=limit.data?.[0]?.config?.quota_total??100;
    if(usage>=total)throw new PublishError({type:'RATE_LIMIT',code:'IG_DAILY_LIMIT',message:'Instagram daily publishing limit reached',retryable:true,retryAfterMs:24*60*60_000});
    const format=String(input.metadata?.format??(input.contentType==='ALBUM'?'ALBUM':input.contentType==='VIDEO'?'REEL':'IMAGE'));
    const media=input.media??(input.mediaUrl?[{url:input.mediaUrl,kind:input.contentType==='VIDEO'?'VIDEO':'IMAGE'}]:[]);
    let containerId:string;
    if(format==='ALBUM'){
      const children:string[]=[];
      for(const item of media){const child=await this.graph.post<{id:string}>(`/${igId}/media`,token,{image_url:item.url,is_carousel_item:true});children.push(child.id)}
      const parent=await this.graph.post<{id:string}>(`/${igId}/media`,token,{media_type:'CAROUSEL',children:children.join(','),caption:input.caption??''});containerId=parent.id;
    }else{
      const item=media[0]!;const payload:Record<string,unknown>=format==='REEL'?{media_type:'REELS',video_url:item.url,caption:input.caption??''}:format==='STORY'?{media_type:'STORIES',...(item.kind==='VIDEO'?{video_url:item.url}:{image_url:item.url})}:{image_url:item.url,caption:input.caption??''};
      const created=await this.graph.post<{id:string}>(`/${igId}/media`,token,payload);containerId=created.id;
    }
    return this.pollStatus({socialAccountId:input.socialAccountId,remoteCorrelationId:containerId});
  }
  async pollStatus(input:{socialAccountId:string;remoteCorrelationId:string}):Promise<PublishResult>{
    const token=await this.tokens(input.socialAccountId),igId=await this.accountIds(input.socialAccountId);
    const result=await this.graph.get<{status_code?:string;status?:string}>(`/${input.remoteCorrelationId}`,token,{fields:'status_code'});
    const status=result.status_code??result.status;
    if(status==='ERROR'||status==='EXPIRED')throw new PublishError({type:'VALIDATION_ERROR',code:'IG_CONTAINER_'+status,message:'Instagram container '+status,retryable:false});
    if(status!=='FINISHED')return{remoteCorrelationId:input.remoteCorrelationId,processing:true};
    const published=await this.graph.post<{id:string}>(`/${igId}/media_publish`,token,{creation_id:input.remoteCorrelationId});
    return{externalPostId:published.id,remoteCorrelationId:input.remoteCorrelationId,publishedAt:Date.now()};
  }
  async fetchPost(postId:string,context?:{socialAccountId?:string}):Promise<PublishedPostData>{
    if(!context?.socialAccountId)throw new Error('ACCOUNT_CONTEXT_REQUIRED');const token=await this.tokens(context.socialAccountId);
    const data=await this.graph.get<{id?:string;permalink?:string;timestamp?:string}>(`/${postId}`,token,{fields:'id,permalink,timestamp'});
    return{externalPostId:data.id??postId,exists:!!data.id,...(data.permalink?{externalUrl:data.permalink}:{}),...(data.timestamp?{publishedAt:Date.parse(data.timestamp)}:{})};
  }
  async fetchMetrics(postId:string,context?:{socialAccountId?:string}):Promise<PostMetricsData>{
    if(!context?.socialAccountId)throw new Error('ACCOUNT_CONTEXT_REQUIRED');const token=await this.tokens(context.socialAccountId);
    const data=await this.graph.get<{data?:Array<{name:string;values?:Array<{value:number}>;value?:number}>}>(`/${postId}/insights`,token,{metric:'views,likes,comments,shares,saved'});
    const metrics:Record<string,number>={};for(const item of data.data??[])metrics[item.name]=Number(item.values?.[0]?.value??item.value??0);
    return{views:metrics.views,likes:metrics.likes,comments:metrics.comments,shares:metrics.shares,saves:metrics.saved,raw:data};
  }
}
