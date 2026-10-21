import test from 'node:test';
import assert from 'node:assert/strict';
import {runDailySnapshots,scheduleBrandSnapshots} from '../../apps/worker/src/analytics/snapshot.job.ts';
import {MemoryRepositories} from '../../packages/shared/src/memory-repositories.ts';
import {MemoryStore} from '../../packages/shared/src/store.ts';
import type {InsightsSource} from '../../packages/platform-contracts/src/insights.ts';

const now=Date.parse('2026-10-21T02:30:00Z');
async function fixture(){const repos=new MemoryRepositories(new MemoryStore());await repos.workspaces.insert({id:'w',name:'Workspace'});await repos.brands.insert({id:'b',workspaceId:'w',name:'Brand',slug:'b',language:'vi',timezone:'UTC',currency:'VND',status:'ACTIVE'});await repos.socialAccounts.insert({id:'a',brandId:'b',platform:'YOUTUBE',publishMode:'API',status:'CONNECTED'});return repos}
const source=(fetchAccountDaily:InsightsSource['fetchAccountDaily']):InsightsSource=>({fetchAccountDaily,fetchProfile:async()=>({hasAvatar:null,hasBio:null,hasLink:null}),fetchPostMetrics:async()=>({raw:{}})});

test('daily snapshot is unique per account and day and second run updates it',async()=>{
  const repos=await fixture();let views=10;
  const yt=source(async()=>[{day:'2026-10-21',followers:100,views:views++,reach:null,engagements:null,profileViews:null,watchTimeMinutes:3,source:'YOUTUBE:analytics',raw:{metric:'views'}}]);
  await runDailySnapshots({repos,sources:{YOUTUBE:yt},now});
  await runDailySnapshots({repos,sources:{YOUTUBE:yt},now:now+60_000});
  const rows=await repos.channelSnapshots.findBy({socialAccountId:'a'});
  assert.equal(rows.length,1);assert.equal(rows[0]?.views,11);assert.equal(rows[0]?.source,'YOUTUBE:analytics');
});

test('one account failure does not prevent another account snapshot',async()=>{
  const repos=await fixture();await repos.socialAccounts.insert({id:'b-ig',brandId:'b',platform:'INSTAGRAM',publishMode:'API',status:'CONNECTED'});
  const result=await runDailySnapshots({repos,sources:{YOUTUBE:source(async()=>{throw Object.assign(new Error('No permission'),{code:'INSIGHTS_PERMISSION_MISSING'})}),INSTAGRAM:source(async()=>[{day:'2026-10-21',followers:7,views:null,reach:null,engagements:null,profileViews:null,watchTimeMinutes:null,source:'INSTAGRAM:followers_count',raw:{}}])},now});
  assert.equal(result.accounts,2);assert.equal(result.written,1);assert.deepEqual(result.failed,[{socialAccountId:'a',code:'INSIGHTS_PERMISSION_MISSING'}]);
});

test('first snapshot fetches up to 28 calendar days but later runs only recent days',async()=>{
  const repos=await fixture(),ranges:string[]=[];
  const yt=source(async(_account,fromDay,toDay)=>{ranges.push(`${fromDay}/${toDay}`);return[{day:'2026-10-21',followers:100,views:null,reach:null,engagements:null,profileViews:null,watchTimeMinutes:null,source:'YOUTUBE:subscriberCount',raw:{}}]});
  await runDailySnapshots({repos,sources:{YOUTUBE:yt},now});await runDailySnapshots({repos,sources:{YOUTUBE:yt},now:now+60_000});
  assert.deepEqual(ranges,['2026-09-24/2026-10-21','2026-10-20/2026-10-21']);
});

test('brand snapshot scheduler runs at 02:00 in each brand timezone',async()=>{
  const repos=await fixture();await repos.brands.insert({id:'b2',workspaceId:'w',name:'Second',slug:'b2',language:'vi',timezone:'Asia/Ho_Chi_Minh',currency:'VND',status:'ACTIVE'});
  const schedules:Array<{id:string;pattern?:string;tz?:string;brandId?:string}>=[];
  await scheduleBrandSnapshots(repos,{upsertJobScheduler:async(id,repeat,template)=>{schedules.push({id,pattern:repeat.pattern,tz:repeat.tz,brandId:template.data.brandId})}});
  assert.deepEqual(schedules,[{id:'analytics:snapshot:b',pattern:'0 2 * * *',tz:'UTC',brandId:'b'},{id:'analytics:snapshot:b2',pattern:'0 2 * * *',tz:'Asia/Ho_Chi_Minh',brandId:'b2'}]);
});

test('snapshot job captures published post metrics once per local day',async()=>{
  const repos=await fixture();await repos.publishedPosts.insert({id:'p',brandId:'b',publishJobId:'j',socialAccountId:'a',contentVariantId:'v',platform:'YOUTUBE',platformPostId:'remote',publishedAt:now-86_400_000});
  const yt=source(async()=>[]);yt.fetchPostMetrics=async()=>({views:45,likes:2,raw:{views:45}});
  await runDailySnapshots({repos,sources:{YOUTUBE:yt},now});await runDailySnapshots({repos,sources:{YOUTUBE:yt},now:now+60_000});
  const metrics=await repos.postMetrics.findBy({publishedPostId:'p'});
  assert.equal(metrics.length,1);assert.equal(metrics[0]?.captureKey,'day:2026-10-21');assert.equal(metrics[0]?.views,45);
});
