import test from 'node:test';
import assert from 'node:assert/strict';
import {preflight} from '../../packages/shared/src/preflight.ts';

const video={kind:'VIDEO' as const,mimeType:'video/mp4',width:1080,height:1920,sizeBytes:1000,durationMs:60_000};
const base={platform:'YOUTUBE' as const,format:'SHORT' as const,title:'Video',hashtags:[],media:[video],youtube:{categoryId:'22',privacyStatus:'private' as const,madeForKids:false,tags:[]}};
test('YouTube description rejects angle brackets',()=>{
  const issues=preflight({...base,description:'See <chapter> here'});
  assert.equal(issues.find(issue=>issue.code==='YT_DESCRIPTION_ANGLE_BRACKETS')?.severity,'error');
});
test('YouTube combined tag length is at most 500 characters',()=>{
  const issues=preflight({...base,youtube:{...base.youtube,tags:['a'.repeat(500),'b']}});
  assert.equal(issues.find(issue=>issue.code==='YT_TAGS_TOO_LONG')?.severity,'error');
});
test('YouTube madeForKids requires an explicit true or false',()=>{
  const {madeForKids:_choice,...incomplete}=base.youtube;
  const missing=preflight({...base,youtube:incomplete});
  assert.equal(missing.find(issue=>issue.code==='YT_MADE_FOR_KIDS_REQUIRED')?.severity,'error');
  const valid=preflight(base);assert.equal(valid.some(issue=>issue.code==='YT_MADE_FOR_KIDS_REQUIRED'),false);
});
