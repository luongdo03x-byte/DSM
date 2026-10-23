import {spawn} from 'node:child_process';
import type {EventEmitter} from 'node:events';
import type {Readable} from 'node:stream';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {parseSrt,type SubtitleSegment} from './srt.ts';

type ProcessLike=EventEmitter&{stdout:Readable;stderr:Readable;kill:()=>unknown};
export async function transcribe(filePath:string,opts:{language:'vi';binary:string;model:string;spawnProcess?:(binary:string,args:string[])=>ProcessLike}):Promise<{segments:SubtitleSegment[]}>{
  const directory=await mkdtemp(join(tmpdir(),'dsm-whisper-'));
  const output=join(directory,'result');
  const args=['-m',opts.model,'-f',filePath,'-l',opts.language,'-osrt','-of',output];
  try{
    await new Promise<void>((resolve,reject)=>{
      const child=(opts.spawnProcess??((binary,passed)=>spawn(binary,passed,{windowsHide:true})))(opts.binary,args);
      let stderr='';
      child.stderr.setEncoding('utf8').on('data',(part:string)=>{stderr=(stderr+part).slice(-4000)});
      const timer=setTimeout(()=>child.kill(),30*60_000);
      child.on('error',error=>{clearTimeout(timer);reject(error)});
      child.on('close',code=>{clearTimeout(timer);code===0?resolve():reject(new Error(`WHISPER_FAILED:${code}:${stderr}`))});
    });
    return{segments:parseSrt(await readFile(output+'.srt','utf8'))};
  }finally{await rm(directory,{recursive:true,force:true})}
}
