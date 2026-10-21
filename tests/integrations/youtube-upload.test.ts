import test from 'node:test';
import assert from 'node:assert/strict';
import {startResumable,sendChunks,queryProgress} from '../../apps/api/src/integrations/google/resumable-upload.ts';
import {YouTubeAdapter} from '../../apps/api/src/integrations/google/youtube.adapter.ts';
import {InMemoryObjectStorage} from '../../apps/api/src/modules/media/media.service.ts';
import type {HttpClient,HttpRequest,HttpResponse} from '../../packages/shared/src/http.ts';
import {QuotaManager} from '../../packages/shared/src/quota.ts';
import {MemoryRepositories} from '../../packages/shared/src/memory-repositories.ts';
import {MemoryStore} from '../../packages/shared/src/store.ts';

function uploadFixture(){
  const calls:HttpRequest[]=[];let uploaded=-1,initCount=0,drop=false;
  const http:HttpClient={async request<T>(request:HttpRequest):Promise<HttpResponse<T>>{
    calls.push(request);
    if(request.url.includes('uploadType=resumable')){initCount++;return{status:200,data:{} as T,headers:{location:'https://upload.test/session-1'}}}
    if(request.url==='https://upload.test/session-1'){
      const range=request.headers?.['content-range']??'';
      if(range.startsWith('bytes */'))return{status:308,data:'' as T,headers:uploaded<0?{}:{range:`bytes=0-${uploaded}`}};
      if(drop&&range.startsWith('bytes 8388608-')){drop=false;uploaded=16_777_215;throw new Error('connection lost')}
      const match=/bytes (\d+)-(\d+)\/(\d+)/.exec(range)!;uploaded=Number(match[2]);
      return uploaded+1===Number(match[3])?{status:200,data:{id:'video-1'} as T}:{status:308,data:'' as T,headers:{range:`bytes=0-${uploaded}`}};
    }
    if(request.url.includes('/playlistItems'))return{status:200,data:{id:'playlist-entry'} as T};
    if(request.url.includes('/thumbnails/set'))return{status:403,data:{error:{errors:[{reason:'forbidden'}]}} as T};
    throw new Error('unexpected '+request.url);
  }};
  return{http,calls,dropNext:()=>{drop=true},initCount:()=>initCount};
}
const settings={categoryId:'22',tags:['dsm','short'],privacyStatus:'private' as const,madeForKids:false,playlistId:'playlist-1'};
function input(size:number){return{brandId:'brand',socialAccountId:'account',contentVariantId:'variant',platform:'YOUTUBE' as const,contentType:'VIDEO' as const,caption:'Title',body:'Description',media:[{url:'https://media.test/video',storageKey:'video',sizeBytes:size,mimeType:'video/mp4',kind:'VIDEO' as const,width:1080,height:1920,durationMs:60_000}],metadata:{format:'SHORT',youtube:settings,thumbnailStorageKey:'cover'}}}

test('YouTube metadata includes snippet and status; Shorts adds no special flag',async()=>{
  const f=uploadFixture(),storage=new InMemoryObjectStorage();await storage.putObject('video',Buffer.from([1,2,3]),'video/mp4');await storage.putObject('cover',Buffer.from([4,5,6]),'image/jpeg');
  const correlations:string[]=[];const adapter=new YouTubeAdapter({baseUrl:'https://youtube.test',http:f.http,tokens:async()=> 'token',storage,audited:false});
  const result=await adapter.publish({...input(3),persistCorrelation:async id=>{correlations.push(id)}});
  assert.equal(result.externalPostId,'video-1');assert.equal(f.initCount(),1);assert.deepEqual(correlations,['resumable:https://upload.test/session-1']);
  const init=f.calls.find(call=>call.url.includes('uploadType=resumable'))!;
  assert.deepEqual((init.body as any).snippet,{title:'Title',description:'Description',tags:['dsm','short'],categoryId:'22'});
  assert.deepEqual((init.body as any).status,{privacyStatus:'private',selfDeclaredMadeForKids:false});
  assert.equal(JSON.stringify(init.body).includes('short'),true);assert.equal(JSON.stringify(init.body).includes('shorts'),false);
  assert.ok(f.calls.some(call=>call.url.includes('/playlistItems')));
  assert.match(result.note??'',/ảnh bìa/);
});

test('resumable upload resumes after interrupted chunk from confirmed Range without new init',async()=>{
  const f=uploadFixture(),size=20*1024*1024,read=async(start:number,end:number)=>Buffer.alloc(end-start+1,1);
  const started=await startResumable({baseUrl:'https://youtube.test',token:'token',metadata:{snippet:{title:'Clip'}},totalBytes:size,mimeType:'video/mp4',http:f.http});
  f.dropNext();const interrupted=await sendChunks(started,read,{chunkBytes:8*1024*1024,token:'token',http:f.http});
  assert.ok('session' in interrupted);
  const resumed=await queryProgress(started,'token',f.http);assert.equal(resumed.confirmedBytes,16_777_216);
  const completed=await sendChunks(resumed,read,{chunkBytes:8*1024*1024,token:'token',http:f.http});
  assert.deepEqual(completed,{videoId:'video-1'});assert.equal(f.initCount(),1);
  assert.equal(f.calls.filter(call=>call.url==='https://upload.test/session-1'&&call.headers?.['content-range']?.startsWith('bytes 16777216-')).length,1);
});

test('completed session query returns video id without another upload',async()=>{
  const requests:HttpRequest[]=[];const http:HttpClient={async request<T>(request:HttpRequest){requests.push(request);return{status:200,data:{id:'already-uploaded'} as T}}};
  const result=await queryProgress({uploadUrl:'https://upload.test/done',totalBytes:3,confirmedBytes:0},'token',http);
  assert.equal(result.videoId,'already-uploaded');assert.equal(result.confirmedBytes,3);
  assert.equal(requests.length,1);
});

test('second project upload is deferred before opening a resumable session',async()=>{
  const f=uploadFixture(),storage=new InMemoryObjectStorage(),quota=new QuotaManager(new MemoryRepositories(new MemoryStore()));await storage.putObject('video',Buffer.from([1,2,3]),'video/mp4');
  const adapter=new YouTubeAdapter({baseUrl:'https://youtube.test',http:f.http,tokens:async()=> 'token',storage,audited:false,quota,dailyUploadLimit:1});
  const first={...input(3),metadata:{format:'SHORT',youtube:{...settings,playlistId:undefined}}};
  await adapter.publish(first);
  await assert.rejects(()=>adapter.publish(first),(error:any)=>error.code==='YT_DAILY_UPLOAD_LIMIT'&&error.type==='RATE_LIMIT');
  assert.equal(f.initCount(),1);
});
