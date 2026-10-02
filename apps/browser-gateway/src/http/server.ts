import {createServer} from 'node:http';
import type {BrowserProvider,CreateBrowserTaskRequest} from '../../../../packages/browser-contracts/src/index.ts';
import {hmac,sha256} from '../../../../packages/shared/src/security.ts';
import type {TaskExecutor} from '../tasks/task-executor.ts';

interface Options{nodeId:string;nodeKey:string;executor:TaskExecutor;provider:BrowserProvider;replayWindowMs?:number}
function respond(res:any,status:number,body:unknown){res.writeHead(status,{'content-type':'application/json; charset=utf-8'});res.end(JSON.stringify(body))}
async function readBody(req:any){const chunks:any[]=[];for await(const c of req)chunks.push(c);return Buffer.concat(chunks).toString('utf8')}
export function createGatewayServer(options:Options){
  const seen=new Set<string>(),windowMs=options.replayWindowMs??60_000;
  return createServer(async(req:any,res:any)=>{
    const method=String(req.method??'GET').toUpperCase(),path=String(req.url??'/').split('?')[0]??'/';
    if(method==='GET'&&path==='/health'){const health=options.executor.health(true);respond(res,200,{status:'HEALTHY',service:'browser-gateway',nodeStatus:health.status,activeTasks:health.activeTasks,capacity:health.capacity,gpmLoginHealthy:health.gpmLoginHealthy,lastHeartbeatAt:health.lastHeartbeatAt});return}
    const raw=await readBody(req),nodeId=String(req.headers['x-node-id']??''),ts=String(req.headers['x-node-ts']??''),sig=String(req.headers['x-node-signature']??'');
    if(nodeId!==options.nodeId||!ts||!sig||Math.abs(Date.now()-Number(ts))>windowMs){respond(res,401,{error:'NODE_AUTH'});return}
    const replay=`${ts}:${sig}`;if(seen.has(replay)){respond(res,401,{error:'REPLAY'});return}
    const expected=await hmac(options.nodeKey,`${ts}\n${method}\n${path}\n${await sha256(raw)}`);if(expected!==sig){respond(res,401,{error:'BAD_SIGNATURE'});return}seen.add(replay);
    try{
      let m:RegExpExecArray|null;
      if(method==='POST'&&(m=/^\/profiles\/([^/]+)\/start$/.exec(path))){respond(res,200,await options.provider.startProfile(decodeURIComponent(m[1]!)));return}
      if(method==='POST'&&(m=/^\/profiles\/([^/]+)\/stop$/.exec(path))){await options.provider.stopProfile(decodeURIComponent(m[1]!));respond(res,200,{ok:true});return}
      if(method==='POST'&&path==='/tasks'){const input=raw?JSON.parse(raw) as CreateBrowserTaskRequest:{} as CreateBrowserTaskRequest;const result=await options.executor.submit(input);respond(res,202,result);return}
      if(method==='GET'&&(m=/^\/tasks\/([^/]+)$/.exec(path))){respond(res,200,options.executor.get(decodeURIComponent(m[1]!)));return}
      respond(res,404,{error:'NOT_FOUND'});
    }catch(error:any){respond(res,error?.message==='CAPACITY_EXCEEDED'?429:500,{error:{code:error?.code??error?.message??'BROWSER_ERROR',message:String(error?.message??error)}})}
  })
}
