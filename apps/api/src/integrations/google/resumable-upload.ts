import type {HttpClient} from '../../../../../packages/shared/src/http.ts';
import {PublishError} from '../../../../../packages/platform-contracts/src/index.ts';
import {nextPacificReset} from '../../../../../packages/shared/src/quota.ts';

export interface ResumableSession {uploadUrl:string;totalBytes:number;confirmedBytes:number;videoId?:string}
const offset=(range?:string)=>{const match=/^bytes=0-(\d+)$/.exec(range??'');return match?Number(match[1])+1:0};
function failed(status:number,data:unknown,phase:string):never{const value=data as {error?:{errors?:Array<{reason?:string}>;message?:string}}|undefined,reason=value?.error?.errors?.[0]?.reason;if(reason==='quotaExceeded'||reason==='uploadLimitExceeded')throw new PublishError({type:'RATE_LIMIT',code:'YT_DAILY_UPLOAD_LIMIT',message:value?.error?.message??reason,retryable:true,retryAfterMs:Math.max(0,nextPacificReset(Date.now())-Date.now())});throw new PublishError({type:status===401?'AUTH_ERROR':'PLATFORM_ERROR',code:`YT_UPLOAD_${phase}_${status}`,message:value?.error?.message??`YouTube upload ${phase} failed (${status})`,retryable:status>=500})}
export async function startResumable(opts:{baseUrl:string;token:string;metadata:Record<string,unknown>;totalBytes:number;mimeType:string;http:HttpClient}):Promise<ResumableSession>{
  const result=await opts.http.request({url:`${opts.baseUrl}/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status`,method:'POST',headers:{authorization:`Bearer ${opts.token}`,'x-upload-content-length':String(opts.totalBytes),'x-upload-content-type':opts.mimeType},body:opts.metadata});
  const uploadUrl=result.headers?.location;if(result.status>=400)failed(result.status,result.data,'INIT');if(!uploadUrl)throw new Error('YT_UPLOAD_LOCATION_MISSING');
  return{uploadUrl,totalBytes:opts.totalBytes,confirmedBytes:0};
}
export async function queryProgress(session:ResumableSession,token:string,http:HttpClient):Promise<ResumableSession>{
  const result=await http.request<{id?:string}>({url:session.uploadUrl,method:'PUT',headers:{authorization:`Bearer ${token}`,'content-range':`bytes */${session.totalBytes}`,'content-length':'0'},body:Buffer.alloc(0)});
  if(result.status===308)return{...session,confirmedBytes:offset(result.headers?.range)};
  if((result.status===200||result.status===201)&&result.data?.id)return{...session,confirmedBytes:session.totalBytes,videoId:result.data.id};
  failed(result.status,result.data,'QUERY');
}
export async function sendChunks(session:ResumableSession,read:(start:number,end:number)=>Promise<Buffer>,opts:{chunkBytes:number;token:string;http:HttpClient}):Promise<{videoId:string}|{session:ResumableSession}>{
  if(opts.chunkBytes<=0||opts.chunkBytes%(256*1024)!==0)throw new Error('INVALID_CHUNK_SIZE');
  let current={...session};
  while(current.confirmedBytes<current.totalBytes){
    const start=current.confirmedBytes,end=Math.min(start+opts.chunkBytes,current.totalBytes)-1;
    const body=await read(start,end);if(body.length!==end-start+1)throw new Error('INVALID_CHUNK_LENGTH');
    let result;
    try{result=await opts.http.request<{id?:string}>({url:current.uploadUrl,method:'PUT',headers:{authorization:`Bearer ${opts.token}`,'content-type':'video/*','content-range':`bytes ${start}-${end}/${current.totalBytes}`},body})}
    catch{return{session:current}}
    if(result.status===308){const confirmed=offset(result.headers?.range);if(confirmed<=start)throw new Error('YT_UPLOAD_NO_PROGRESS');current={...current,confirmedBytes:confirmed};continue}
    if((result.status===200||result.status===201)&&result.data?.id)return{videoId:result.data.id};
    failed(result.status,result.data,'CHUNK');
  }
  return{session:current};
}
