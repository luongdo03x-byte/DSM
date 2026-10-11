import test from 'node:test';
import assert from 'node:assert/strict';
import {buildAnalyticsModel} from '../../apps/web/src/features/analytics/analytics-model.ts';
test('analytics null metrics stay unavailable',()=>{const model=buildAnalyticsModel({posts:null,views:null,clicks:null,ctr:null},[{platform:'FACEBOOK',posts:null,views:0,clicks:4,ctr:null}]);assert.deepEqual(model.summary,{posts:0,views:0,clicks:0,ctr:null});assert.equal(model.platforms[0]?.ctr,null);assert.equal(model.hasData,true)});
test('empty snapshots do not create fake platform rows',()=>{const model=buildAnalyticsModel({posts:0,views:0,clicks:0,ctr:null,platforms:[]},[]);assert.equal(model.hasData,false);assert.deepEqual(model.platforms,[])});
test('platform rows normalize and sort by views',()=>{const model=buildAnalyticsModel({posts:3,views:100,clicks:5,ctr:5},[{platform:'TIKTOK',posts:1,views:20,clicks:1,ctr:5},{platform:'FACEBOOK',posts:2,views:80,clicks:4,ctr:5}]);assert.deepEqual(model.platforms.map(row=>row.platform),['FACEBOOK','TIKTOK']);assert.equal(model.summary.views,100)});
