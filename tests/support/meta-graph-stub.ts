import {createServer} from 'node:http';

type Request={method:string;path:string;query:Record<string,string>;body:unknown};
type Reply={status:number;body:unknown;delayMs?:number};
export async function startMetaGraphStub(){
  const calls:Request[]=[];
  const handlers=new Map<string,(request:Request)=>Reply>();
  const server=createServer(async(req,res)=>{
    const url=new URL(req.url??'/', 'http://127.0.0.1');
    const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));
    const raw=Buffer.concat(chunks).toString();
    let body:unknown=undefined;try{body=JSON.parse(raw)}catch{if(raw)body=Object.fromEntries(new URLSearchParams(raw))}
    const request:Request={method:req.method??'GET',path:url.pathname,query:Object.fromEntries(url.searchParams),body};calls.push(request);
    const reply=handlers.get(url.pathname)?.(request)??{status:404,body:{error:{message:'No stub for '+url.pathname}}};
    if(reply.delayMs)await new Promise(resolve=>setTimeout(resolve,reply.delayMs));
    res.writeHead(reply.status,{'content-type':'application/json'});res.end(JSON.stringify(reply.body));
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();if(!address||typeof address==='string')throw new Error('STUB_LISTEN_FAILED');
  return {url:`http://127.0.0.1:${address.port}`,calls,setResponse(route:string,handler:(request:Request)=>Reply){handlers.set(route,handler)},close:()=>new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()))};
}
