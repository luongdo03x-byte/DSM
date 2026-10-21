import test from 'node:test';
import assert from 'node:assert/strict';
import {bestTimes,BEST_TIME_MIN_POSTS} from '../../packages/shared/src/growth/best-time.ts';

const friday=Date.parse('2026-10-16T13:00:00Z'),now=Date.parse('2026-10-21T00:00:00Z');
const posts=Array.from({length:20},(_,i)=>({publishedAt:friday-Math.floor(i/2)*7*86_400_000,views24h:100+i,followersAtPost:1000}));
test('best time requires 20 posts in 90 days and names the remaining count',()=>{
  assert.equal(BEST_TIME_MIN_POSTS,20);
  assert.deepEqual(bestTimes(posts.slice(0,19),'Asia/Bangkok',now),{insufficientData:true,needed:'Cần thêm 1 bài'});
});
test('best time groups Friday 20:00 in brand timezone',()=>{
  const result=bestTimes(posts,'Asia/Bangkok',now);
  assert.ok('slots' in result);if('slots' in result)assert.deepEqual([result.slots[0]?.weekday,result.slots[0]?.hour],[5,20]);
});
test('best time does not score missing 24-hour views or follower baseline',()=>{
  const result=bestTimes(Array.from({length:20},(_,i)=>({publishedAt:friday-i*86_400_000,views24h:null,followersAtPost:null})),'UTC',now);
  assert.ok('insufficientData' in result);
});
