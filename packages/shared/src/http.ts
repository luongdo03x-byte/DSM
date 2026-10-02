export interface HttpRequest{url:string;method?:string;headers?:Record<string,string>;body?:unknown}
export interface HttpResponse<T=any>{status:number;data:T;headers?:Record<string,string>}
export interface HttpClient{request<T=any>(req:HttpRequest):Promise<HttpResponse<T>>}
export class FetchHttpClient implements HttpClient{async request<T=any>(req:HttpRequest):Promise<HttpResponse<T>>{const r=await fetch(req.url,{method:req.method??'GET',headers:{...(req.body!==undefined?{'content-type':'application/json'}:{}),...(req.headers??{})},...(req.body!==undefined?{body:typeof req.body==='string'?req.body:JSON.stringify(req.body)}:{})});let data:any;try{data=await r.json()}catch{data=await r.text()}return{status:r.status,data,headers:Object.fromEntries(r.headers.entries())}}}
