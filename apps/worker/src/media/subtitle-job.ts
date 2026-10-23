import {spawn} from 'node:child_process';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {z} from 'zod';
import type {Repositories} from '../../../../packages/shared/src/repositories.ts';
import type {ObjectStorage} from '../../../api/src/modules/media/media.service.ts';
import type {AiService} from '../../../api/src/modules/ai/ai.service.ts';
import {applyTranscriptCleanup,toSrt} from './srt.ts';
import {transcribe} from './transcribe.ts';

const CleanupSchema=z.object({segments:z.array(z.object({startMs:z.number().int().nonnegative(),endMs:z.number().int().positive(),text:z.string().min(1)}))});
export interface SubtitleJob{brandId:string;assetId:string}
export const SUBTITLE_QUEUE='dsm-subtitles';

async function convertToWav(input:string,output:string):Promise<void>{
  await new Promise<void>((resolve,reject)=>{
    const child=spawn('ffmpeg',['-nostdin','-v','error','-y','-i',input,'-ar','16000','-ac','1','-c:a','pcm_s16le',output],{windowsHide:true});
    let stderr='';child.stderr.setEncoding('utf8').on('data',(chunk:string)=>{stderr=(stderr+chunk).slice(-4000)});
    const timer=setTimeout(()=>child.kill(),30*60_000);
    child.on('error',error=>{clearTimeout(timer);reject(error)});
    child.on('close',code=>{clearTimeout(timer);code===0?resolve():reject(new Error(`SUBTITLE_FFMPEG_FAILED:${code}:${stderr}`))});
  });
}

export async function runSubtitleJob(deps:{repos:Repositories;storage:ObjectStorage;ai?:Pick<AiService,'run'>|undefined;binary:string;model:string},job:SubtitleJob):Promise<{storageKey:string;warning?:string}>{
  const source=await deps.repos.media.get(job.assetId);
  if(!source||source.brandId!==job.brandId||source.type!=='VIDEO')throw new Error('SUBTITLE_VIDEO_NOT_FOUND');
  if(source.subtitleStorageKey)return{storageKey:source.subtitleStorageKey};
  const directory=await mkdtemp(join(tmpdir(),'dsm-subtitles-'));
  try{
    const input=join(directory,'source.video'),wav=join(directory,'audio.wav');
    const bytes=await deps.storage.getObject(source.storageKey);
    if(bytes.length>500_000_000)throw new Error('SUBTITLE_VIDEO_TOO_LARGE');
    await writeFile(input,bytes);
    await convertToWav(input,wav);
    const original=(await transcribe(wav,{language:'vi',binary:deps.binary,model:deps.model})).segments;
    if(!original.length)throw new Error('SUBTITLE_EMPTY_TRANSCRIPT');
    let segments=original,warning:string|undefined;
    if(deps.ai){
      try{
        const response=await deps.ai.run('SUBTITLE_CLEANUP',job.brandId,CleanupSchema,JSON.stringify({instruction:'Chỉ sửa dấu câu, chính tả và ngắt dòng tiếng Việt. Giữ nguyên số đoạn và startMs/endMs; không thêm dữ kiện.',segments:original}));
        const checked=applyTranscriptCleanup(original,response.data.segments);segments=checked.segments;warning=checked.warning;
      }catch{warning='SUBTITLE_CLEANUP_UNAVAILABLE'}
    }
    const key=`workspace/${source.workspaceId}/brand/${source.brandId}/media/subtitles/${source.id}/vi.srt`;
    await deps.storage.putObject(key,Buffer.from(toSrt(segments),'utf8'),'application/x-subrip');
    await deps.repos.media.update(source.id,{subtitleStorageKey:key});
    return{storageKey:key,...(warning?{warning}:{})};
  }finally{await rm(directory,{recursive:true,force:true})}
}
