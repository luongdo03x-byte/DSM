import type {HttpClient} from '../../../../../packages/shared/src/http.ts';import {PublishError} from '../../../../../packages/platform-contracts/src/index.ts';import type {MetaConfig} from './meta.config.ts';

export class MetaGraphClient {
  private readonly baseUrl:string;private readonly version:string;private readonly fetchImpl:typeof fetch;private readonly timeoutMs:number;
  constructor(opts:{baseUrl:string;version:string;fetchImpl?:typeof fetch;timeoutMs?:number}){this.baseUrl=opts.baseUrl.replace(/\/$/,'');this.version=opts.version.replace(/^\//,'');this.fetchImpl=opts.fetchImpl??fetch;this.timeoutMs=opts.timeoutMs??30_000}
  async get<T>(path:string,token:string,params:Record<string,string>={}):Promise<T>{return this.request<T>('GET',path,token,params)}
  async post<T>(path:string,token:string,body:Record<string,unknown>|FormData):Promise<T>{return this.request<T>('POST',path,token,{},body)}
  async delete<T>(path:string,token:string):Promise<T>{return this.request<T>('DELETE',path,token,{})}
  private async request<T>(method:string,path:string,token:string,params:Record<string,string>,body?:Record<string,unknown>|FormData):Promise<T>{
    const url=new URL(`${this.baseUrl}/${this.version}/${path.replace(/^\//,'')}`);
    for(const [key,value] of Object.entries(params))url.searchParams.set(key,value);
    const init:RequestInit={method,headers:token?{authorization:`Bearer ${token}`}:{},signal:AbortSignal.timeout(this.timeoutMs)};
    if(body instanceof FormData)init.body=body;
    else if(body){init.headers={...init.headers,'content-type':'application/json'};init.body=JSON.stringify(body)}
    let response:Response;try{response=await this.fetchImpl(url,init)}catch{throw new PublishError({type:'NETWORK_ERROR',code:'NETWORK',message:'Meta request failed',retryable:true})}
    let data:any;try{data=await response.json()}catch{data={}}
    const error=data?.error;if(!response.ok||error){const code=String(error?.code??`HTTP_${response.status}`),message=String(error?.message??'Meta request failed');
      const type=response.status===401||response.status===403||code==='190'?'AUTH_ERROR':response.status===429||['4','17','32','613'].includes(code)?'RATE_LIMIT':response.status>=500?'NETWORK_ERROR':code==='100'?'VALIDATION_ERROR':'PLATFORM_ERROR';
      throw new PublishError({type,code,message,retryable:type==='RATE_LIMIT'||type==='NETWORK_ERROR',retryAfterMs:type==='RATE_LIMIT'?Number(response.headers.get('retry-after')??0)*1000||undefined:undefined});
    }
    return data as T;
  }
}
export class MetaHttpClient{private h:HttpClient;private c:MetaConfig;constructor(h:HttpClient,c:MetaConfig){this.h=h;this.c=c}graph(path:string,token:string,method='GET',body?:unknown){return this.call(`${this.c.graphBaseUrl}/${this.c.graphVersion}${path}`,token,method,body)}threads(path:string,token:string,method='GET',body?:unknown){return this.call(`${this.c.threadsBaseUrl}${path}`,token,method,body)}private async call(url:string,token:string,method:string,body?:unknown){let r;try{r=await this.h.request({url,method,headers:{authorization:`Bearer ${token}`},...(body!==undefined?{body}:{})})}catch(e:any){throw new PublishError({type:'NETWORK_ERROR',code:'NETWORK',message:String(e?.message??e),retryable:true})}const err:any=(r.data as any)?.error;if(r.status===401||r.status===403)throw new PublishError({type:'AUTH_ERROR',code:err?.code?.toString()??'AUTH',message:err?.message??'Authorization failed',retryable:false});if(r.status===429)throw new PublishError({type:'RATE_LIMIT',code:'RATE_LIMIT',message:err?.message??'Rate limited',retryable:true,retryAfterMs:Number(r.headers?.['retry-after']??0)*1000||undefined});if(r.status>=500)throw new PublishError({type:'PLATFORM_ERROR',code:`HTTP_${r.status}`,message:err?.message??'Meta server error',retryable:true});if(r.status>=400||err)throw new PublishError({type:'PLATFORM_ERROR',code:err?.code?.toString()??`HTTP_${r.status}`,message:err?.message??'Meta request failed',retryable:false});return r.data as any}}
