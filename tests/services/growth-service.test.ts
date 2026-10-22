import test from 'node:test';
import assert from 'node:assert/strict';
import {MemoryStore} from '../../packages/shared/src/store.ts';
import {MemoryRepositories} from '../../packages/shared/src/memory-repositories.ts';
import {GrowthService} from '../../apps/api/src/modules/growth/growth.service.ts';
import {weeklyGrowthReport} from '../../apps/worker/src/analytics/weekly-report.job.ts';
import {NotificationDispatcher} from '../../apps/worker/src/notifications/notification-dispatcher.ts';
import {renderVietnamese} from '../../packages/shared/src/notifications.ts';
import {scheduleWeeklyReports} from '../../apps/worker/src/analytics/weekly-report.job.ts';

const now=Date.UTC(2026,9,23,12),day=(offset:number)=>new Date(now+offset*86_400_000).toISOString().slice(0,10);
async function setup(){
  const repos=new MemoryRepositories(new MemoryStore());
  await repos.workspaces.insert({id:'w',name:'Workspace'});await repos.brands.insert({id:'b',workspaceId:'w',name:'Brand',slug:'brand',language:'vi',timezone:'Asia/Ho_Chi_Minh',currency:'VND',status:'ACTIVE'});
  await repos.socialAccounts.insert({id:'a',brandId:'b',platform:'INSTAGRAM',publishMode:'API',status:'CONNECTED'});
  await repos.channelGoals.insert({id:'goal',socialAccountId:'a',postsPer28Days:8});
  for(let offset=-28;offset<=0;offset++)await repos.channelSnapshots.insert({id:`s${offset}`,socialAccountId:'a',day:day(offset),followers:100+offset,views:10,reach:8,engagements:2,profileViews:1,watchTimeMinutes:null,source:'INSTAGRAM:insights',capturedAt:now+offset*86_400_000,raw:{}});
  await repos.contents.insert({id:'c',brandId:'b',type:'IMAGE',title:'Published',status:'READY'});await repos.variants.insert({id:'v',contentItemId:'c',platform:'INSTAGRAM',hashtags:[],status:'READY'});
  await repos.publishBatches.insert({id:'batch',brandId:'b',contentItemId:'c',createdBy:'u',createdAt:now});
  await repos.publishJobs.insert({id:'job',batchId:'batch',brandId:'b',socialAccountId:'a',contentVariantId:'v',platform:'INSTAGRAM',strategy:'API',scheduledAt:now-1, status:'PUBLISHED',attemptCount:1,maxAttempts:3,idempotencyKey:'k'});
  await repos.publishedPosts.insert({id:'post',brandId:'b',publishJobId:'job',socialAccountId:'a',contentVariantId:'v',platform:'INSTAGRAM',platformPostId:'remote',publishedAt:now-1});
  await repos.postMetrics.append({id:'m',publishedPostId:'post',capturedAt:now,captureKey:'day',views:77,likes:7,comments:2,shares:1});
  return repos;
}

test('growth metrics include platform source and capture time and show insufficient 20-post history',async()=>{
  const repos=await setup(),growth=new GrowthService(repos,()=>now),result=await growth.account('b','a',now,28);
  assert.equal('followersDelta' in result.growth?result.growth.followersDelta:null,28);
  assert.equal(result.metrics.followers.source,'INSTAGRAM:insights');
  assert.equal(result.metrics.followers.capturedAt,now);
  assert.equal(result.metrics.followersDelta.source,'INSTAGRAM:insights');
  assert.equal(result.metrics.posts28.capturedAt,now);
  assert.equal(result.metrics.healthScore.source,'DSM:healthScore');
  assert.equal('insufficientData' in result.bestTimes?result.bestTimes.insufficientData:false,true);
  assert.match('needed' in result.bestTimes?result.bestTimes.needed:'',/Cần thêm 19 bài/);
  assert.ok(result.health.score!==null);
});

test('best posting times use retained 24-hour metrics after later daily metrics arrive',async()=>{
  const repos=await setup(),dayMs=86_400_000;
  for(let index=0;index<20;index++){
    const publishedAt=now-(25-index)*dayMs,id='best-post-'+index;
    await repos.publishedPosts.insert({id,brandId:'b',publishJobId:'job-'+index,socialAccountId:'a',contentVariantId:'v',platform:'INSTAGRAM',platformPostId:'remote-'+index,publishedAt});
    await repos.postMetrics.append({id:'early-'+index,publishedPostId:id,capturedAt:publishedAt+24*60*60_000,captureKey:'24h',views:100,likes:5,comments:2});
    await repos.postMetrics.append({id:'later-'+index,publishedPostId:id,capturedAt:now,captureKey:'later',views:200,likes:10,comments:4});
  }
  const result=await new GrowthService(repos,()=>now).account('b','a',now,28);
  assert.equal('slots' in result.bestTimes,true);
  assert.ok('slots' in result.bestTimes&&result.bestTimes.slots.length>0);
});

test('weekly report has five sections and dispatches WEEKLY_REPORT via notification dispatcher',async()=>{
  const repos=await setup();const sent:any[]=[];
  await repos.notificationChannels.insert({id:'notice',workspaceId:'w',kind:'EMAIL',target:'test@example.test',enabled:true});
  const dispatcher=new NotificationDispatcher(repos,{EMAIL:{send:async(_channel,event)=>{sent.push(event)}},TELEGRAM:{send:async(_channel,event)=>{sent.push(event)}}});
  const reports=await weeklyGrowthReport({repos,dispatcher,now});
  assert.equal(reports.sent,1);
  assert.equal(sent[0]?.kind,'WEEKLY_REPORT');
  assert.equal(sent[0]?.sections.posts.value,1);
  assert.equal(sent[0]?.sections.views.value,77);
  assert.equal(sent[0]?.sections.followersDelta.value,28);
  assert.equal(sent[0]?.sections.bestPost.title,'Published');
  assert.ok(sent[0]?.sections.nextAction);
  const rendered=renderVietnamese(sent[0],'https://dsm.test');
  for(const title of ['Số bài:','Lượt xem:','Người theo dõi tăng/giảm:','Bài tốt nhất:','Việc nên làm:'])assert.ok(rendered.text.includes(title));
});

test('weekly reports are scheduled for Monday morning in each brand timezone',async()=>{
  const repos=await setup(),scheduled:any[]=[];
  const count=await scheduleWeeklyReports(repos,{upsertJobScheduler:async(id,repeat,template)=>{scheduled.push({id,repeat,template})}});
  assert.equal(count,1);
  assert.equal(scheduled[0]?.id,'growth:weekly:b');
  assert.deepEqual(scheduled[0]?.repeat,{pattern:'0 8 * * 1',tz:'Asia/Ho_Chi_Minh'});
});
