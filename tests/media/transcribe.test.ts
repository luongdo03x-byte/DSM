import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {writeFile} from 'node:fs/promises';
import {transcribe} from '../../apps/worker/src/media/transcribe.ts';

test('transcribe invokes local whisper with Vietnamese and SRT output',async()=>{
  let args:string[]=[];
  const result=await transcribe('tests/fixtures/media/vi-speech-5s.wav',{language:'vi',binary:'whisper-cli',model:'model.bin',spawnProcess:(_binary,passed)=>{
    args=passed;
    const child=Object.assign(new EventEmitter(),{stdout:new PassThrough(),stderr:new PassThrough(),kill:()=>{}});
    queueMicrotask(async()=>{await writeFile(args[args.indexOf('-of')+1]+'.srt','1\n00:00:01,000 --> 00:00:02,500\nXin chào\n');child.emit('close',0)});
    return child;
  }});
  assert.ok(args.includes('-l')&&args.includes('vi'));
  assert.ok(args.includes('-osrt'));
  assert.deepEqual(result.segments,[{startMs:1000,endMs:2500,text:'Xin chào'}]);
});
