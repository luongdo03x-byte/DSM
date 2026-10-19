import test from 'node:test';
import assert from 'node:assert/strict';
import {MemoryStore} from '../../packages/shared/src/store.ts';
import {MemoryRepositories} from '../../packages/shared/src/memory-repositories.ts';
import {NotificationDispatcher} from '../../apps/worker/src/notifications/notification-dispatcher.ts';
import {renderVietnamese,type NotificationEvent} from '../../packages/shared/src/notifications.ts';
import {TelegramNotifier} from '../../apps/worker/src/notifications/telegram.notifier.ts';
import {EmailNotifier} from '../../apps/worker/src/notifications/email.notifier.ts';
import {JobRunner} from '../../apps/worker/src/publishing/job-runner.service.ts';
import {FakePublisher} from '../../apps/worker/src/testing/fake-publisher.ts';
import {PublisherRegistry} from '../../apps/api/src/modules/publishing/publisher-registry.ts';

const event:NotificationEvent={kind:'JOB_FAILED',brandId:'brand-1',jobId:'job-1',platform:'FACEBOOK',title:'Bài thử',errorCode:'RATE_LIMIT',errorMessage:'Quá giới hạn'};
test('renderVietnamese JOB_FAILED có tên nền tảng, mã lỗi và link tới lịch',()=>{
  const rendered=renderVietnamese(event,'https://dsm.example');
  assert.match(rendered.text,/Facebook/);
  assert.match(rendered.text,/RATE_LIMIT/);
  assert.match(rendered.text,/https:\/\/dsm.example\/app\/brands\/brand-1\/calendar/);
});
test('dispatcher gửi tới mọi kênh bật',async()=>{
  const repos=new MemoryRepositories(new MemoryStore());
  await repos.notificationChannels.insert({id:'t1',workspaceId:'ws',kind:'TELEGRAM',target:'123',enabled:true});
  await repos.notificationChannels.insert({id:'e1',workspaceId:'ws',kind:'EMAIL',target:'a@example.test',enabled:true});
  await repos.notificationChannels.insert({id:'e2',workspaceId:'ws',kind:'EMAIL',target:'b@example.test',enabled:false});
  const sent:string[]=[];
  const notifier={send:async(channel:{id:string})=>{sent.push(channel.id)}};
  const result=await new NotificationDispatcher(repos,{TELEGRAM:notifier,EMAIL:notifier}).dispatch('ws',event);
  assert.deepEqual(result,{sent:2,failed:0});assert.deepEqual(sent,['t1','e1']);
});
test('lỗi gửi thông báo không làm hỏng job',async()=>{
  const repos=new MemoryRepositories(new MemoryStore());
  await repos.notificationChannels.insert({id:'t1',workspaceId:'ws',kind:'TELEGRAM',target:'123',enabled:true});
  const bad={send:async()=>{throw new Error('TOKEN_INVALID')}};
  const result=await new NotificationDispatcher(repos,{TELEGRAM:bad,EMAIL:bad}).dispatch('ws',event);
  assert.deepEqual(result,{sent:0,failed:1});
  assert.equal((await repos.audit.findBy({action:'NOTIFICATION_FAILED'})).length,1);
});
test('Telegram notifier posts chat_id and rejects bot API failure',async()=>{
  const calls:Array<{url:string;body:any}>=[];
  const fetcher=(async(url:string,init:{body:string})=>{calls.push({url,body:JSON.parse(init.body)});return{ok:true,json:async()=>({ok:true})}}) as unknown as typeof fetch;
  const notifier=new TelegramNotifier({token:'test-token',baseUrl:'https://telegram.example',appUrl:'https://dsm.example',fetcher});
  await notifier.send({id:'c',workspaceId:'ws',kind:'TELEGRAM',target:'12345',enabled:true},event);
  assert.equal(calls[0]?.url,'https://telegram.example/bottest-token/sendMessage');
  assert.equal(calls[0]?.body.chat_id,'12345');
  assert.match(calls[0]?.body.text,/RATE_LIMIT/);
  const bad=new TelegramNotifier({token:'bad',appUrl:'https://dsm.example',fetcher:(async()=>({ok:false,json:async()=>({ok:false})})) as unknown as typeof fetch});
  await assert.rejects(()=>bad.send({id:'c',workspaceId:'ws',kind:'TELEGRAM',target:'12345',enabled:true},event),/TELEGRAM_SEND_FAILED/);
});
test('Email notifier sends Vietnamese subject and text to configured target',async()=>{
  const sent:Array<{from:string;to:string;subject:string;text:string}>=[];
  const notifier=new EmailNotifier({host:'smtp.example',port:587,secure:false,from:'dsm@example.test',appUrl:'https://dsm.example',transporter:{sendMail:async message=>{sent.push(message)}}});
  await notifier.send({id:'e',workspaceId:'ws',kind:'EMAIL',target:'owner@example.test',enabled:true},event);
  assert.equal(sent[0]?.to,'owner@example.test');assert.match(sent[0]?.subject??'',/thất bại/);assert.match(sent[0]?.text??'',/RATE_LIMIT/);
});
test('final publish failure remains FAILED when notification delivery fails',async()=>{
  const repos=new MemoryRepositories(new MemoryStore());
  await repos.workspaces.insert({id:'ws',name:'Workspace'});
  await repos.brands.insert({id:'brand-1',workspaceId:'ws',name:'Brand',slug:'brand',language:'vi',timezone:'UTC',currency:'VND',status:'ACTIVE'});
  await repos.contents.insert({id:'content-1',brandId:'brand-1',type:'TEXT',title:'Bài thử',status:'READY'});
  await repos.variants.insert({id:'variant-1',contentItemId:'content-1',platform:'FACEBOOK',hashtags:[],status:'READY'});
  await repos.socialAccounts.insert({id:'account-1',brandId:'brand-1',platform:'FACEBOOK',publishMode:'API',status:'CONNECTED'});
  await repos.publishBatches.insert({id:'batch-1',brandId:'brand-1',contentItemId:'content-1',createdBy:'owner',createdAt:1});
  await repos.publishJobs.insert({id:'job-1',batchId:'batch-1',brandId:'brand-1',socialAccountId:'account-1',contentVariantId:'variant-1',platform:'FACEBOOK',strategy:'API',scheduledAt:1,status:'QUEUED',attemptCount:0,maxAttempts:1,idempotencyKey:'once'});
  await repos.notificationChannels.insert({id:'channel-1',workspaceId:'ws',kind:'TELEGRAM',target:'123',enabled:true});
  const bad={send:async()=>{throw new Error('TOKEN_INVALID')}},dispatcher=new NotificationDispatcher(repos,{TELEGRAM:bad,EMAIL:bad});
  const publisher=new FakePublisher();publisher.fail=new Error('provider outage');const registry=new PublisherRegistry();registry.register('FACEBOOK','API',publisher);
  const runner=new JobRunner(repos,registry,undefined,undefined,Date.now,dispatcher);
  const result=await runner.run('job-1',async()=>({brandId:'brand-1',socialAccountId:'account-1',contentVariantId:'variant-1',platform:'FACEBOOK',contentType:'TEXT',body:'Hello'}));
  assert.equal(result,'FAILED');assert.equal((await repos.publishJobs.get('job-1'))?.status,'FAILED');
  assert.equal((await repos.audit.findBy({action:'NOTIFICATION_FAILED'})).length,1);
});
