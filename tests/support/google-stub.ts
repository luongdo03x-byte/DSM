import {createServer} from 'node:http';
export async function startGoogleStub(){
  const calls:Array<{path:string;body:string}>=[];
  const server=createServer(async(req,res)=>{
    const path=new URL(req.url??'/','http://127.0.0.1').pathname,chunks:Buffer[]=[];
    for await(const chunk of req)chunks.push(Buffer.from(chunk));const body=Buffer.concat(chunks).toString();calls.push({path,body});
    const result=path==='/token'?{access_token:'stub-access',refresh_token:'stub-refresh',expires_in:3600,scope:'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly'}:path==='/youtube/v3/channels'?{items:[{id:'stub-channel',snippet:{title:'Stub Channel'}}]}:{error:'not_found'};
    res.writeHead(path==='/token'||path==='/youtube/v3/channels'?200:404,{'content-type':'application/json'});res.end(JSON.stringify(result));
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();if(!address||typeof address==='string')throw new Error('STUB_LISTEN_FAILED');
  return{url:`http://127.0.0.1:${address.port}`,calls,close:()=>new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()))};
}
