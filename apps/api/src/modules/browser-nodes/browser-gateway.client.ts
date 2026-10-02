import type {BrowserNode} from '../../../../../packages/shared/src/domain.ts';
import type {BrowserTaskResult,CreateBrowserTaskRequest} from '../../../../../packages/browser-contracts/src/index.ts';
import {hmac,sha256} from '../../../../../packages/shared/src/security.ts';

type FetchLike=(url:string,init?:RequestInit)=>Promise<Response>;
export class BrowserGatewayClient{
  private keyResolver:(nodeId:string)=>Promise<string>;private fetcher:FetchLike;
  constructor(keyResolver:(nodeId:string)=>Promise<string>,fetcher:FetchLike=fetch){this.keyResolver=keyResolver;this.fetcher=fetcher}
  async startProfile(node:BrowserNode,providerProfileId:string){return this.request(node,`/profiles/${encodeURIComponent(providerProfileId)}/start`,'POST',{})}
  async stopProfile(node:BrowserNode,providerProfileId:string){return this.request(node,`/profiles/${encodeURIComponent(providerProfileId)}/stop`,'POST',{})}
  async createTask(node:BrowserNode,input:CreateBrowserTaskRequest){return this.request(node,'/tasks','POST',input) as Promise<{taskId:string}>}
  async getTask(node:BrowserNode,taskId:string){return this.request(node,`/tasks/${encodeURIComponent(taskId)}`,'GET') as Promise<BrowserTaskResult>}
  private async request(node:BrowserNode,path:string,method:string,body?:unknown){
    const key=await this.keyResolver(node.id),timestamp=String(Date.now()),raw=body===undefined||method==='GET'?'':JSON.stringify(body),signature=await hmac(key,`${timestamp}\n${method}\n${path}\n${await sha256(raw)}`);
    const headers:Record<string,string>={'x-node-id':node.id,'x-node-ts':timestamp,'x-node-signature':signature};if(raw)headers['content-type']='application/json';
    const response=await this.fetcher(`http://${node.host}:${node.port}${path}`,{method,headers,...(raw?{body:raw}:{})});let data:any;try{data=await response.json()}catch{data={}}
    if(!response.ok)throw Object.assign(new Error(String(data?.error?.message??data?.error??`BROWSER_GATEWAY_HTTP_${response.status}`)),{code:data?.error?.code??'BROWSER_ERROR',retryable:response.status>=500||response.status===429});return data;
  }
}
