import test from 'node:test';
import assert from 'node:assert/strict';
import {healthScore} from '../../packages/shared/src/growth/health-score.ts';

const full={profile:{hasAvatar:true,hasBio:true,hasLink:true},cadence:{posts28:5,target28:10,ratio:0.5,streakDays:2},growth:{followersDelta:25,followersPct:0.025,viewsSum:null},engagementRate:0.025,successRate:1};
test('health score follows approved weighted formula and rounds only total',()=>{
  const result=healthScore(full);
  assert.equal(result.score,63);
  assert.deepEqual(result.parts.map(part=>part.points),[15,15,12.5,10,10]);
});
test('health score reweights missing goal and labels it',()=>{
  const result=healthScore({...full,cadence:{...full.cadence,target28:null,ratio:null}});
  assert.equal(result.score,68);assert.equal(result.parts.find(part=>part.key==='cadence')?.note,'Chưa đặt mục tiêu');
});
test('health score remains null when all components are unavailable',()=>{
  const result=healthScore({profile:{hasAvatar:null,hasBio:null,hasLink:null},cadence:{posts28:0,target28:null,ratio:null,streakDays:0},growth:{insufficientData:true,needed:'data'} as const,engagementRate:null,successRate:null});
  assert.equal(result.score,null);
});
