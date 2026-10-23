import test from 'node:test';
import assert from 'node:assert/strict';
import {MemoryStore} from '../../packages/shared/src/store.ts';
import {MemoryRepositories} from '../../packages/shared/src/memory-repositories.ts';
import {ContentPlanService} from '../../apps/api/src/modules/ai/content-plan.service.ts';
import {PublishingService} from '../../apps/api/src/modules/publishing/publishing.service.ts';
import {PublisherRegistry} from '../../apps/api/src/modules/publishing/publisher-registry.ts';
import {StrategyResolver} from '../../apps/api/src/modules/publishing/strategy-resolver.ts';
import {createDevelopmentRuntime} from '../../apps/api/src/runtime/dev-runtime.ts';

async function setup(items:{date:string;socialAccountId:string;pillarId:string;format:'IMAGE';idea:string;hook:string}[]){
  const repos=new MemoryRepositories(new MemoryStore());
  await repos.brands.insert({id:'b',workspaceId:'w',name:'B',slug:'b',language:'vi',timezone:'Asia/Ho_Chi_Minh',currency:'VND',status:'ACTIVE'});
  await repos.socialAccounts.insert({id:'a',brandId:'b',platform:'INSTAGRAM',publishMode:'API',status:'CONNECTED'});
  await repos.channelGoals.insert({id:'goal',socialAccountId:'a',postsPer28Days:28});
  await repos.contentPillars.insert({id:'pillar',brandId:'b',name:'Kiến thức',color:'#123456'});
  const calls:any[]=[];
  const ai={run:async(...args:any[])=>{calls.push(args);return{data:{items},usage:{input:1,output:1,cacheRead:0}}}};
  return{repos,calls,service:new ContentPlanService(repos,ai as any)};
}
const item=(date:string)=>({date,socialAccountId:'a',pillarId:'pillar',format:'IMAGE' as const,idea:`Ý tưởng ${date}`,hook:`Hook ${date}`});

test('kế hoạch bỏ qua ngày đã có bài cùng kênh',async()=>{
  const {repos,service,calls}=await setup([item('2026-11-11'),item('2026-11-12')]);
  await repos.contents.insert({id:'existing',brandId:'b',type:'IMAGE',title:'Bài đã lên lịch',status:'READY'});
  await repos.variants.insert({id:'variant',contentItemId:'existing',socialAccountId:'a',platform:'INSTAGRAM',hashtags:[],status:'READY'});
  await repos.publishBatches.insert({id:'batch',brandId:'b',contentItemId:'existing',createdBy:'u',createdAt:1});
  await repos.publishJobs.insert({id:'job',batchId:'batch',brandId:'b',socialAccountId:'a',contentVariantId:'variant',platform:'INSTAGRAM',strategy:'API',scheduledAt:Date.parse('2026-11-11T04:00:00Z'),status:'QUEUED',attemptCount:0,maxAttempts:3,idempotencyKey:'x'});
  const result=await service.generate('b','2026-11-01',['a']);
  assert.deepEqual(result.skipped,[{date:'2026-11-11',socialAccountId:'a',reason:'ALREADY_SCHEDULED'}]);
  assert.equal(result.created.length,1);
  assert.equal(result.created[0]?.status,'DRAFT');
  assert.equal((await repos.publishJobs.findBy({brandId:'b'})).length,1);
  assert.equal(calls[0][0],'PLAN_30D');
  assert.deepEqual(calls[0][4],{stream:true});
});

test('mục tiêu 28 bài mỗi 28 ngày được quy ra tối đa 30 bản nháp trong 30 ngày',async()=>{
  const items=Array.from({length:32},(_,index)=>item(new Date(Date.UTC(2026,10,1+index)).toISOString().slice(0,10)));
  const {service}=await setup(items);
  const result=await service.generate('b','2026-11-01',['a']);
  assert.equal(result.created.length,30);
  assert.ok(result.issues.length>0);
});

test('ngày sale 11/11 được gắn tên sự kiện cho bản nháp',async()=>{
  const {service,repos}=await setup([item('2026-11-11')]);
  const result=await service.generate('b','2026-11-01',['a']);
  assert.equal(result.created[0]?.plannedEventName,'Sale 11/11');
  const calendar=await new PublishingService(repos,new PublisherRegistry(),new StrategyResolver()).listCalendar('b',Date.parse('2026-11-10T00:00:00Z'),Date.parse('2026-11-13T00:00:00Z'));
  assert.equal(calendar[0]?.kind,'PLANNED');
  assert.equal(calendar[0]?.status,'DRAFT');
});

test('route kế hoạch tạo bản nháp và route hook yêu cầu đăng nhập',async()=>{
  let accountId='';
  const client={beta:{messages:{create:async()=>{throw new Error('unexpected')},stream:()=>({finalMessage:async()=>({content:[{type:'text',text:JSON.stringify({items:[{...item('2026-11-11'),socialAccountId:accountId}]})}],stop_reason:'end_turn',usage:{input_tokens:2,output_tokens:3}})})}}};
  const app=await createDevelopmentRuntime({env:{DEV_OWNER_PASSWORD:'secret',CREDENTIAL_ENCRYPTION_KEY:Buffer.alloc(32,4).toString('base64')},aiClient:client as any});
  accountId=(await app.repos.socialAccounts.findBy({brandId:'local-brand',platform:'INSTAGRAM'}))[0]!.id;
  await app.repos.channelGoals.insert({id:'goal',socialAccountId:accountId,postsPer28Days:28});
  await app.repos.contentPillars.insert({id:'pillar',brandId:'local-brand',name:'Kiến thức',color:'#123456'});
  const denied=await app.runtime.handle({method:'GET',path:'/brands/local-brand/hooks'});
  assert.equal(denied.status,401);
  const login=await app.runtime.handle({method:'POST',path:'/auth/login',body:{email:'owner@local.test',password:'secret'}});
  const headers={authorization:'Bearer '+(login.body as {accessToken:string}).accessToken};
  const result=await app.runtime.handle({method:'POST',path:'/brands/local-brand/ai/plan',headers,body:{startDate:'2026-11-01',socialAccountIds:[accountId]}});
  assert.equal(result.status,200);
  assert.equal((result.body as any).created[0].status,'DRAFT');
  assert.equal((await app.repos.publishJobs.findBy({brandId:'local-brand'})).length,0);
  assert.equal((await app.runtime.handle({method:'GET',path:'/brands/local-brand/hooks',headers})).status,200);
});
