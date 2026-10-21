import type {HttpClient} from '../../../../../packages/shared/src/http.ts';

export interface ResumableSession {uploadUrl:string;totalBytes:number;confirmedBytes:number;videoId?:string}
const offset=(range?:string)=>{const match=/^bytes=0-(\d+)$/.exec(range??'');return match?Number(match[1])+1:0};
export async function startResumable(opts:{baseUrl:string;token:string;metadata:Record<string,unknown>;totalBytes:number;mimeType:string;http:HttpClient}):Promise<ResumableSession>{
  const result=await opts.http.request({url:`${opts.baseUrl}/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status`,method:'POST',headers:{authorization:`Bearer ${opts.token}`,'x-upload-content-length':String(opts.totalBytes),'x-upload-content-type':opts.mimeType},body:opts.metadata});
  const uploadUrl=result.headers?.location;if(result.status>=400||!uploadUrl)throw new Error(`YT_UPLOAD_INIT_FAILED:${result.status}`);
  return{uploadUrl,totalBytes:opts.totalBytes,confirmedBytes:0};
}
export async function queryProgress(session:ResumableSession,token:string,http:HttpClient):Promise<ResumableSession>{
  const result=await http.request<{id?:string}>({url:session.uploadUrl,method:'PUT',headers:{authorization:`Bearer ${token}`,'content-range':`bytes */${session.totalBytes}`,'content-length':'0'},body:Buffer.alloc(0)});
  if(result.status===308)return{...session,confirmedBytes:offset(result.headers?.range)};
  if((result.status===200||result.status===201)&&result.data?.id)return{...session,confirmedBytes:session.totalBytes,videoId:result.data.id};
  throw new Error(`YT_UPLOAD_QUERY_FAILED:${result.status}`);
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
    throw new Error(`YT_UPLOAD_CHUNK_FAILED:${result.status}`);
  }
  return{session:current};
}
