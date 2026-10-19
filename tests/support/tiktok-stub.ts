import {createServer} from 'node:http';

export async function startTikTokStub(){
  const calls:Array<{path:string;body:unknown}>=[];
  const server=createServer(async(req,res)=>{
    const path=new URL(req.url??'/','http://127.0.0.1').pathname;
    const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));const raw=Buffer.concat(chunks).toString();
    let body:unknown;try{body=JSON.parse(raw)}catch{body=Object.fromEntries(new URLSearchParams(raw))}
    calls.push({path,body});
    const result=path==='/v2/oauth/token/'?{data:{access_token:'stub-access',refresh_token:'stub-refresh',open_id:'stub-user',expires_in:86400,scope:'user.info.basic,video.publish,video.upload'}}:path==='/v2/user/info/'?{data:{user:{open_id:'stub-user',display_name:'Stub Creator',username:'stubcreator'}}}:{error:{code:'not_found'}};
    res.writeHead(path==='/v2/oauth/token/'||path==='/v2/user/info/'?200:404,{'content-type':'application/json'});res.end(JSON.stringify(result));
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();if(!address||typeof address==='string')throw new Error('STUB_LISTEN_FAILED');
  return{url:`http://127.0.0.1:${address.port}`,calls,close:()=>new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()))};
}
