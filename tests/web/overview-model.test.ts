import test from 'node:test';
import assert from 'node:assert/strict';
import {buildOverviewModel} from '../../apps/web/src/features/overview/overview-model.ts';

test('overview handles empty API responses without fake metrics',()=>{
  const model=buildOverviewModel({analytics:{posts:null,views:undefined,clicks:null,ctr:null,platforms:[]},accounts:[],jobs:[]},Date.parse('2026-10-11T08:00:00Z'));
  assert.deepEqual(model.kpis,{publishedPosts:0,views:0,clicks:0,scheduledJobs:0,failedJobs:0,activeAccounts:0});
  assert.deepEqual(model.platforms,[]);
  assert.deepEqual(model.todaySchedule,[]);
});
test('overview counts failed jobs and connected accounts only',()=>{
  const model=buildOverviewModel({analytics:{posts:4,views:10,clicks:2,ctr:20},accounts:[{id:'a',status:'CONNECTED'},{id:'b',status:'DISCONNECTED'}],jobs:[{id:'1',status:'FAILED',scheduledAt:100},{id:'2',status:'QUEUED',scheduledAt:200}]},500);
  assert.equal(model.kpis.failedJobs,1);
  assert.equal(model.kpis.scheduledJobs,1);
  assert.equal(model.kpis.activeAccounts,1);
});
test('overview avoids NaN and marks missing browser profile as a warning',()=>{
  const model=buildOverviewModel({analytics:{posts:NaN,views:Infinity,platforms:[{platform:'FACEBOOK',posts:null,views:NaN,clicks:undefined,ctr:Infinity}]},accounts:[{id:'a',status:'CONNECTED',publishMode:'BROWSER'}]},Date.now());
  assert.equal(model.kpis.publishedPosts,0);
  assert.equal(model.kpis.views,0);
  assert.deepEqual(model.platforms[0],{platform:'Facebook',posts:0,views:0,clicks:0,ctr:null});
  assert.equal(model.accountHealth[0]?.warning,true);
});
