import type {MemorySession} from '../features/auth/session.ts';
export type FetchResponse={status:number;json:()=>Promise<any>};
export type Fetcher=(url:string,init?:{method?:string;headers?:Record<string,string>;body?:string;credentials?:'include'|'omit'|'same-origin'})=>Promise<FetchResponse>;
export class ApiClient{
  private session:MemorySession; private fetcher:Fetcher; private csrfTokenResolver:()=>string|undefined;
  constructor(input:{session:MemorySession;fetcher:Fetcher;csrfTokenResolver?:()=>string|undefined}){this.session=input.session;this.fetcher=input.fetcher;this.csrfTokenResolver=input.csrfTokenResolver??(()=>undefined)}
  async request<T=unknown>(url:string,init?:{method?:string;headers?:Record<string,string>;body?:string;credentials?:'include'|'omit'|'same-origin'}):Promise<T>{
    const first=await this.send(url,init);
    if(first.status!==401)return this.parse<T>(first);
    const csrf=this.csrfTokenResolver();const headers=csrf?{'x-csrf-token':csrf}:{};
    const refreshed=await this.fetcher('/auth/refresh',{method:'POST',headers,credentials:'include'});
    if(refreshed.status!==200){this.session.clear();throw new Error('UNAUTHORIZED')}
    const body=await refreshed.json();
    if(!body?.accessToken){this.session.clear();throw new Error('UNAUTHORIZED')}
    this.session.setAccessToken(body.accessToken);
    const second=await this.send(url,init);
    if(second.status===401){this.session.clear();throw new Error('UNAUTHORIZED')}
    return this.parse<T>(second);
  }
  private send(url:string,init?:{method?:string;headers?:Record<string,string>;body?:string;credentials?:'include'|'omit'|'same-origin'}){
    const token=this.session.getAccessToken(); const headers={...(init?.headers??{}),...(token?{authorization:`Bearer ${token}`}:{})};
    return this.fetcher(url,{...(init??{}),headers,credentials:init?.credentials??'include'});
  }
  private async parse<T>(r:FetchResponse):Promise<T>{if(r.status>=400)throw new Error(`HTTP_${r.status}`);return r.json() as Promise<T>}
}

export function readCookie(name:string,raw?:string){const source=raw??(typeof document!=='undefined'?document.cookie:'');for(const part of source.split(';')){const [key,...rest]=part.trim().split('=');if(key===name)return decodeURIComponent(rest.join('='))}return undefined}
export function createBrowserFetcher(baseUrl=(typeof process!=='undefined'?process.env.NEXT_PUBLIC_API_BASE_URL:undefined)??'http://127.0.0.1:4000'):Fetcher{return async(url,init)=>{const request:RequestInit={method:init?.method??'GET',credentials:init?.credentials??'include',...(init?.headers?{headers:init.headers}:{}),...(init?.body!==undefined?{body:init.body}:{})};return fetch(`${baseUrl.replace(/\/$/,'')}${url}`,request) as any}}
