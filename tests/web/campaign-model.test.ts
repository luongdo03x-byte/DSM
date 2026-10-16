import test from 'node:test';
import assert from 'node:assert/strict';
import {campaignStats,campaignViewModel,filterCampaigns} from '../../apps/web/src/features/campaigns/campaign-model.ts';
test('campaign model does not invent performance when endpoint has no data',()=>{const model=campaignViewModel({id:'c1',name:'Chiến dịch mới',status:'DRAFT'});assert.equal(model.views,null);assert.equal(model.clicks,null);assert.equal(model.ctr,null);assert.equal(model.hasPerformance,false)});
test('campaign model safely normalizes invalid metrics',()=>{const model=campaignViewModel({id:'c1',name:'Test',status:'ACTIVE'},{views:NaN,clicks:Infinity,ctr:NaN,posts:2});assert.equal(model.views,0);assert.equal(model.clicks,0);assert.equal(model.ctr,null);assert.equal(model.posts,2)});
test('campaign search and status summary work',()=>{const campaigns=[{id:'1',name:'Mùa hè',status:'ACTIVE'},{id:'2',name:'Tết',status:'DRAFT'},{id:'3',name:'Sale',status:'COMPLETED'}];assert.equal(filterCampaigns(campaigns,'HÈ').length,1);assert.deepEqual(campaignStats(campaigns),{total:3,draft:1,active:1,completed:1})});
