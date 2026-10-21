import test from 'node:test';
import assert from 'node:assert/strict';
import {growthOverWindow,byPillar} from '../../packages/shared/src/growth/growth.ts';
import {cadence} from '../../packages/shared/src/growth/goals.ts';
import type {ChannelSnapshot} from '../../packages/shared/src/domain.ts';

const snapshot=(day:string,followers:number|null,views:number|null):ChannelSnapshot=>({id:day,socialAccountId:'a',day,followers,views,reach:null,engagements:null,profileViews:null,watchTimeMinutes:null,source:'YOUTUBE:analytics',capturedAt:Date.parse(day+'T00:00:00Z'),raw:{}});

test('one or too-recent snapshot cannot claim 28-day growth',()=>{
  assert.deepEqual(growthOverWindow([snapshot('2026-10-21',1050,10)],28),{insufficientData:true,needed:'Cần dữ liệu đủ 28 ngày'});
  assert.deepEqual(growthOverWindow([snapshot('2026-10-20',1000,10),snapshot('2026-10-21',1050,10)],28),{insufficientData:true,needed:'Cần dữ liệu đủ 28 ngày'});
  assert.deepEqual(growthOverWindow([snapshot('2026-08-01',900,10),snapshot('2026-10-21',1050,10)],28),{insufficientData:true,needed:'Cần dữ liệu đủ 28 ngày'});
});

test('28-day follower growth uses real endpoints and never invents missing views',()=>{
  assert.deepEqual(growthOverWindow([snapshot('2026-09-23',1000,10),snapshot('2026-10-21',1050,null)],28),{followersDelta:50,followersPct:0.05,viewsSum:null});
});

test('cadence counts posts in last 28 days and streak in brand timezone',()=>{
  const now=Date.parse('2026-10-21T03:00:00Z');
  const posts=[Date.parse('2026-10-19T18:30:00Z'),Date.parse('2026-10-20T18:30:00Z'),Date.parse('2026-10-01T12:00:00Z')];
  const result=cadence(posts,{id:'goal',socialAccountId:'a',postsPer28Days:6},now,'Asia/Bangkok');
  assert.deepEqual(result,{posts28:3,target28:6,ratio:0.5,streakDays:2});
  assert.equal(cadence(posts,undefined,now,'Asia/Bangkok').ratio,null);
});

test('pillar groups unassigned posts as NONE and reports median views',()=>{
  const result=byPillar([{pillarId:'education',views:10,engagements:1},{pillarId:'education',views:30,engagements:3},{views:7,engagements:null}]);
  assert.deepEqual(result,[{pillarId:'education',posts:2,medianViews:20,engagementRate:0.1},{pillarId:'NONE',posts:1,medianViews:7,engagementRate:null}]);
});
