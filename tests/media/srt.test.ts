import test from 'node:test';
import assert from 'node:assert/strict';
import {toSrt,parseSrt,applyTranscriptCleanup} from '../../apps/worker/src/media/srt.ts';

test('SRT numbers cues from one and formats millisecond timestamps',()=>{
  assert.equal(toSrt([{startMs:1000,endMs:2500,text:'Xin chào'}]),'1\n00:00:01,000 --> 00:00:02,500\nXin chào\n');
});

test('SRT wraps at 42 characters without splitting a word',()=>{
  const text='Đây là một câu phụ đề tiếng Việt khá dài để kiểm tra việc ngắt dòng an toàn';
  const srt=toSrt([{startMs:0,endMs:5000,text}]);
  const lines=srt.trim().split('\n').slice(2);
  assert.ok(lines.length>1);
  assert.ok(lines.every(line=>line.length<=42));
  assert.equal(lines.join(' '),text);
});

test('cleanup refuses shifted timestamps and keeps original with warning',()=>{
  const original=[{startMs:1000,endMs:2500,text:'Xin chao'}];
  const result=applyTranscriptCleanup(original,[{startMs:1100,endMs:2500,text:'Xin chào'}]);
  assert.deepEqual(result.segments,original);
  assert.equal(result.warning,'SUBTITLE_TIMESTAMPS_CHANGED');
  assert.deepEqual(parseSrt(toSrt(result.segments)),original);
});
