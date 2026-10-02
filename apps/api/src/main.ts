import {createServer} from 'node:http';
import type {LocalApiRuntime,LocalRequest,LocalResponse} from './runtime/local-api.ts';
import {createDevelopmentRuntime} from './runtime/dev-runtime.ts';
import {LocalWorkerRuntime,metricsCaptureKey} from '../../worker/src/runtime/local-worker.ts';
import {JsonStorePersistence} from './runtime/json-store-persistence.ts';

const port=Number(process.env.API_PORT??4000);

function json(res:any,status:number,body:unknown,headers:Record<string,unknown>={}){
  res.writeHead(status,{'content-type':'application/json; charset=utf-8',...headers});
  res.end(status===204?'':JSON.stringify(body));
}
function normalizeHeaders(input:Record<string,unknown>):Record<string,string>{
  const out:Record<string,string>={};
  for(const [key,value] of Object.entries(input)){if(typeof value==='string')out[key.toLowerCase()]=value;else if(Array.isArray(value)&&value[0]!==undefined)out[key.toLowerCase()]=String(value[0])}
  return out;
}
function parseCookies(raw:string|undefined){const out:Record<string,string>={};for(const item of (raw??'').split(';')){const i=item.indexOf('=');if(i<1)continue;out[item.slice(0,i).trim()]=decodeURIComponent(item.slice(i+1).trim())}return out}
function authCookies(refreshToken:string,csrfToken:string){
  const secure=process.env.COOKIE_SECURE==='true'?'; Secure':'';
  return [`refresh_token=${encodeURIComponent(refreshToken)}; HttpOnly; SameSite=Lax; Path=/auth; Max-Age=2592000${secure}`,`csrf_token=${encodeURIComponent(csrfToken)}; SameSite=Lax; Path=/auth; Max-Age=2592000${secure}`];
}
function clearAuthCookies(){const secure=process.env.COOKIE_SECURE==='true'?'; Secure':'';return [`refresh_token=; HttpOnly; SameSite=Lax; Path=/auth; Max-Age=0${secure}`,`csrf_token=; SameSite=Lax; Path=/auth; Max-Age=0${secure}`]}
async function bodyOf(req:any):Promise<unknown>{
  if(req.method==='GET'||req.method==='HEAD')return undefined;
  const chunks:any[]=[];for await(const chunk of req)chunks.push(chunk);
  if(!chunks.length)return undefined;
  const raw=Buffer.concat(chunks).toString('utf8');if(!raw)return undefined;
  try{return JSON.parse(raw)}catch{throw new Error('INVALID_JSON')}
}
function stripRefresh(response:LocalResponse):{response:LocalResponse;cookies?:string[]}{
  if(!response.body||typeof response.body!=='object'||Array.isArray(response.body))return{response};
  const body=response.body as Record<string,unknown>;const refreshToken=body.refreshToken,csrfToken=body.csrfToken;
  if(typeof refreshToken!=='string'||typeof csrfToken!=='string')return{response};
  const {refreshToken:_removed,...publicBody}=body;
  return{response:{...response,body:publicBody},cookies:authCookies(refreshToken,csrfToken)};
}

function corsHeaders(req:any){const origin=String(req.headers?.origin??'');const allowed=(process.env.WEB_ORIGINS??'http://127.0.0.1:3000,http://localhost:3000').split(',').map(x=>x.trim()).filter(Boolean);if(!origin||!allowed.includes(origin))return{};return{'access-control-allow-origin':origin,'access-control-allow-credentials':'true','access-control-allow-methods':'GET,POST,PATCH,DELETE,OPTIONS','access-control-allow-headers':'authorization,content-type,x-csrf-token','vary':'Origin'}}
export function startApiServer(portNumber=port,runtime?:LocalApiRuntime){
  const server=createServer(async(req:any,res:any)=>{
    const path=String(req.url??'/').split('?')[0]??'/',cors=corsHeaders(req);
    if(req.method==='OPTIONS'){res.writeHead(204,cors);res.end();return}
    if(req.method==='GET'&&path==='/health'){json(res,200,{status:'HEALTHY',service:'api'},cors);return}
    if(!runtime){json(res,404,{error:'NOT_FOUND'},cors);return}
    try{
      const headers=normalizeHeaders(req.headers??{});let body=await bodyOf(req);
      if((path==='/auth/refresh'||path==='/auth/logout')&&req.method==='POST'){
        const cookies=parseCookies(headers.cookie);const refresh=cookies.refresh_token,csrfCookie=cookies.csrf_token,csrfHeader=headers['x-csrf-token'];
        if(!refresh){json(res,401,{error:'INVALID_REFRESH'},cors);return}
        if(!csrfCookie||!csrfHeader||csrfCookie!==csrfHeader){json(res,403,{error:'CSRF_MISMATCH'},cors);return}
        body={refreshToken:refresh};
      }
      const request:LocalRequest={method:String(req.method??'GET'),path,headers};if(body!==undefined)request.body=body;
      let response=await runtime.handle(request);
      const transformed=stripRefresh(response);response=transformed.response;
      const outHeaders:Record<string,unknown>={...cors,...(response.headers??{})};if(transformed.cookies)outHeaders['set-cookie']=transformed.cookies;if(path==='/auth/logout'&&response.status===204)outHeaders['set-cookie']=clearAuthCookies();
      json(res,response.status,response.body,outHeaders);
    }catch(error:unknown){
      if(error instanceof Error&&error.message==='INVALID_JSON'){json(res,400,{error:'INVALID_JSON'},cors);return}
      json(res,500,{error:'INTERNAL_ERROR'},cors);
    }
  });
  server.listen(portNumber,'127.0.0.1');return server;
}

async function boot(){
  if(process.env.DEV_IN_MEMORY==='1'){
    if(process.env.APP_ENV==='production')throw new Error('DEV_IN_MEMORY_FORBIDDEN_IN_PRODUCTION');
    const persistence=process.env.DEV_STORE_FILE?new JsonStorePersistence(process.env.DEV_STORE_FILE):undefined;
    const store=persistence?await persistence.load():undefined;
    const app=await createDevelopmentRuntime({...((store)?{store}: {})});
    const server=startApiServer(port,app.runtime),worker=new LocalWorkerRuntime(app.store,app.registry,app.services.media);
    const timer=setInterval(()=>{void worker.tick().catch(error=>console.error('local worker tick failed',error));void worker.syncMetrics(metricsCaptureKey()).catch(error=>console.error('local metrics sync failed',error))},Number(process.env.LOCAL_WORKER_INTERVAL_MS??1000));
    let saving=false;const persist=async()=>{if(!persistence||saving)return;saving=true;try{await persistence.save(app.store)}catch(error){console.error('local store persistence failed',error)}finally{saving=false}};
    const persistenceTimer=persistence?setInterval(()=>void persist(),Number(process.env.LOCAL_STORE_FLUSH_MS??2000)):undefined;
    server.once('close',()=>{clearInterval(timer);if(persistenceTimer)clearInterval(persistenceTimer);void persist()})
  }else startApiServer(port);
  console.log(`api listening on ${port}`)
}
if(process.argv[1]?.endsWith('/main.ts'))void boot().catch(error=>{console.error(error);process.exitCode=1})
