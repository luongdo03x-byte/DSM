import {hmac,sha256} from '../../../../packages/shared/src/security.ts';
type FetchLike=(url:string,init?:RequestInit)=>Promise<Response>;
export class BrowserNodeAgentClient{
  private base:string;private nodeId:string;private fetcher:FetchLike;
  constructor(input:{coreApiUrl:string;nodeId:string;fetcher?:FetchLike}){this.base=input.coreApiUrl.replace(/\/$/,'');this.nodeId=input.nodeId;this.fetcher=input.fetcher??fetch}
  async register(registrationToken:string){const r=await this.fetcher(`${this.base}/browser-nodes/${encodeURIComponent(this.nodeId)}/register`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({registrationToken})});const j:any=await r.json();if(!r.ok||!j.nodeKey)throw new Error(j?.error??'NODE_REGISTRATION_FAILED');return String(j.nodeKey)}
  async heartbeat(nodeKey:string,input:{status:'ONLINE'|'DEGRADED';maxConcurrency:number}){const path=`/browser-nodes/${encodeURIComponent(this.nodeId)}/heartbeat`,body=JSON.stringify(input),ts=String(Date.now()),sig=await hmac(nodeKey,`${ts}\nPOST\n${path}\n${await sha256(body)}`);const r=await this.fetcher(`${this.base}${path}`,{method:'POST',headers:{'content-type':'application/json','x-node-ts':ts,'x-node-signature':sig},body});if(!r.ok){let j:any={};try{j=await r.json()}catch{}throw new Error(j?.error??'HEARTBEAT_FAILED')}return r.json()}
}
