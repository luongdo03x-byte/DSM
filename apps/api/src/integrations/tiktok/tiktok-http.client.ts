import type {HttpClient,HttpRequest} from '../../../../../packages/shared/src/http.ts';
import {PublishError} from '../../../../../packages/platform-contracts/src/index.ts';
import {SlidingWindowLimiter} from '../../../../../packages/shared/src/rate-limiter.ts';
import type {TikTokConfig} from './tiktok.config.ts';

export const TIKTOK_REQUESTS_PER_MINUTE=6;
export class TikTokHttpClient{
  private readonly h:HttpClient;private readonly c:TikTokConfig;private readonly limiter:SlidingWindowLimiter;
  constructor(h:HttpClient,c:TikTokConfig,limiter=new SlidingWindowLimiter({limit:TIKTOK_REQUESTS_PER_MINUTE,windowMs:60_000})){this.h=h;this.c=c;this.limiter=limiter}
  async api(path:string,token:string,method='POST',body?:unknown,accountId?:string){return this.call({url:`${this.c.apiBaseUrl}${path}`,method,headers:{authorization:`Bearer ${token}`,'content-type':'application/json; charset=UTF-8'},...(body!==undefined?{body}:{})},accountId??token)}
  async oauth(body:URLSearchParams){return this.call({url:`${this.c.apiBaseUrl}/v2/oauth/token/`,method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:body.toString()},'oauth:'+this.c.clientKey)}
  async upload(url:string,bytes:Uint8Array,start:number,end:number,total:number,accountId?:string){return this.call({url,method:'PUT',headers:{'content-type':'video/mp4','content-length':String(bytes.byteLength),'content-range':`bytes ${start}-${end}/${total}`},body:bytes},accountId??url)}
  private async call(req:HttpRequest,key:string){
    await this.limiter.acquire(key);
    let r;try{r=await this.h.request(req)}catch(e:any){throw new PublishError({type:'NETWORK_ERROR',code:'NETWORK',message:String(e?.message??e),retryable:true})}
    const err:any=(r.data as any)?.error,code=String(err?.code??'');
    if(r.status===401||code==='access_token_invalid'||code==='scope_not_authorized')throw new PublishError({type:'AUTH_ERROR',code:code||'AUTH',message:err?.message??'TikTok authorization failed',retryable:false});
    if(r.status===429||code==='rate_limit_exceeded')throw new PublishError({type:'RATE_LIMIT',code:code||'RATE_LIMIT',message:err?.message??'TikTok rate limited',retryable:true});
    if(code==='url_ownership_unverified')throw new PublishError({type:'VALIDATION_ERROR',code,message:'Domain media chưa được xác minh với TikTok',retryable:false});
    if(code==='unaudited_client_can_only_post_to_private_accounts')throw new PublishError({type:'VALIDATION_ERROR',code,message:'App chưa được TikTok duyệt: hãy chọn Chỉ mình tôi',retryable:false});
    if(r.status>=500)throw new PublishError({type:'PLATFORM_ERROR',code:`HTTP_${r.status}`,message:err?.message??'TikTok server error',retryable:true});
    if(r.status>=400||(err&&code&&code!=='ok'))throw new PublishError({type:'PLATFORM_ERROR',code:code||`HTTP_${r.status}`,message:err?.message??'TikTok request failed',retryable:false});
    return r.data as any;
  }
}
