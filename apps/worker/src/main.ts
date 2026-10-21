import {Queue,Worker} from 'bullmq';
import IORedis from 'ioredis';
import type {PublisherRegistry} from '../../api/src/modules/publishing/publisher-registry.ts';
import {createRuntime} from '../../api/src/runtime/dev-runtime.ts';
import {BullJobQueue, PUBLISH_API_QUEUE} from './queue/bull-job-queue.ts';
import {JobRunner} from './publishing/job-runner.service.ts';
import {PublishInputBuilder} from './publishing/publish-input.builder.ts';
import {RecoveryService} from './maintenance/recovery.service.ts';
import {refreshExpiringTokens} from './maintenance/token-refresh.job.ts';
import type {PlatformAdapter} from '../../../packages/platform-contracts/src/adapter.ts';
import {NotificationDispatcher} from './notifications/notification-dispatcher.ts';
import {TelegramNotifier} from './notifications/telegram.notifier.ts';
import {EmailNotifier} from './notifications/email.notifier.ts';
import type {NotificationEvent} from '../../../packages/shared/src/notifications.ts';
import type {InsightsSource} from '../../../packages/platform-contracts/src/insights.ts';
import {runDailySnapshots,scheduleBrandSnapshots,SNAPSHOT_QUEUE} from './analytics/snapshot.job.ts';

export interface WorkerOptions {env: Record<string, string | undefined>; registry?: PublisherRegistry}

export async function startWorker(options: WorkerOptions): Promise<{close(): Promise<void>}> {
  const env: Record<string, string | undefined> = {...options.env, RUNTIME_STORE: 'postgres'};
  if (!env.REDIS_URL) throw new Error('REDIS_URL_REQUIRED');
  const app = await createRuntime({env});
  if (!('queue' in app) || !(app.queue instanceof BullJobQueue)) {
    await app.close();
    throw new Error('POSTGRES_RUNTIME_REQUIRED');
  }
  const queue = app.queue;
  const connection = new IORedis(env.REDIS_URL, {maxRetriesPerRequest: null});
  const name = env.PUBLISH_QUEUE_NAME ?? PUBLISH_API_QUEUE;
  const appUrl=env.WEB_APP_BASE_URL??'http://127.0.0.1:3000';
  const dispatcher=new NotificationDispatcher(app.repos,{TELEGRAM:new TelegramNotifier({token:env.TELEGRAM_BOT_TOKEN??'',appUrl,...(env.TELEGRAM_API_BASE_URL?{baseUrl:env.TELEGRAM_API_BASE_URL}:{})}),EMAIL:new EmailNotifier({host:env.SMTP_HOST??'',port:Number(env.SMTP_PORT??587),secure:env.SMTP_SECURE==='true',from:env.SMTP_FROM??'',appUrl,...(env.SMTP_USER?{user:env.SMTP_USER}:{}),...(env.SMTP_PASSWORD?{password:env.SMTP_PASSWORD}:{})})});
  const notify=async(event:NotificationEvent)=>{try{const brand=await app.repos.brands.get(event.brandId);if(brand)await dispatcher.dispatch(brand.workspaceId,event)}catch(error){console.error('notification dispatch failed',error)}};
  const runner = new JobRunner(app.repos, options.registry ?? app.registry,undefined,queue,Date.now,dispatcher);
  const activeRegistry=app.registry;
  const insightSources:Partial<Record<'FACEBOOK'|'INSTAGRAM'|'TIKTOK'|'YOUTUBE',InsightsSource>>={};
  for(const platform of ['FACEBOOK','INSTAGRAM','TIKTOK','YOUTUBE'] as const){const adapter=activeRegistry.get(platform,'API');if('fetchAccountDaily' in adapter)insightSources[platform]=adapter as unknown as InsightsSource}
  const analyticsQueueConnection=new IORedis(env.REDIS_URL,{maxRetriesPerRequest:null});
  const analyticsWorkerConnection=new IORedis(env.REDIS_URL,{maxRetriesPerRequest:null});
  const analyticsQueue=new Queue<{brandId:string}>(SNAPSHOT_QUEUE,{connection:analyticsQueueConnection});
  const analyticsWorker=new Worker<{brandId:string}>(SNAPSHOT_QUEUE,async job=>runDailySnapshots({repos:app.repos,sources:insightSources,now:Date.now(),brandId:String(job.data.brandId)}),{connection:analyticsWorkerConnection,concurrency:1,autorun:false});
  analyticsWorker.on('error',error=>console.error('analytics snapshot worker failed',error));
  const refreshTokens=async()=>refreshExpiringTokens({repos:app.repos,adapters:{FACEBOOK:activeRegistry.get('FACEBOOK','API') as PlatformAdapter,INSTAGRAM:activeRegistry.get('INSTAGRAM','API') as PlatformAdapter,TIKTOK:activeRegistry.get('TIKTOK','API') as PlatformAdapter,YOUTUBE:activeRegistry.get('YOUTUBE','API') as PlatformAdapter},now:Date.now(),notify});
  const builder = new PublishInputBuilder(app.repos, app.services.media);
  const recovery = new RecoveryService(app.repos);
  const concurrency = Math.max(1, Number(env.WORKER_CONCURRENCY ?? 4));
  const worker = new Worker(name, async job => job.data.poll?runner.poll(String(job.data.jobId)):runner.run(String(job.data.jobId), current => builder.build(current)),
    {connection, concurrency, autorun: false});
  worker.on('completed', (job, status) => {
    if (status !== 'RETRYING' && status !== 'SKIPPED') return;
    void app.repos.publishJobs.get(String(job.data.jobId)).then(current => {
      if (current?.status === 'RETRYING' || current?.status === 'QUEUED') return queue.reschedule(current.id, current.scheduledAt);
    }).catch(error => console.error('worker retry scheduling failed', error));
  });
  worker.on('error', error => console.error('worker error', error));
  try {
    await recovery.requeueMissing(queue);
    await scheduleBrandSnapshots(app.repos,analyticsQueue);
    void worker.run().catch(error => console.error('worker run failed', error));
    void analyticsWorker.run().catch(error=>console.error('analytics worker run failed',error));
  } catch (error) {
    await worker.close();
    await analyticsWorker.close();
    await analyticsQueue.close();
    analyticsQueueConnection.disconnect();
    analyticsWorkerConnection.disconnect();
    connection.disconnect();
    await app.close();
    throw error;
  }
  const timer = setInterval(() => {void recovery.requeueMissing(queue).catch(error => console.error('worker recovery failed', error))}, 60_000);
  const tokenTimer=setInterval(()=>{void refreshTokens().catch(error=>console.error('Platform token refresh failed',error))},60*60_000);
  const snapshotTimer=setInterval(()=>{void scheduleBrandSnapshots(app.repos,analyticsQueue).catch(error=>console.error('Analytics scheduler failed',error))},60*60_000);
  void refreshTokens().catch(error=>console.error('Platform token refresh failed',error));
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    clearInterval(timer);
    clearInterval(tokenTimer);
    clearInterval(snapshotTimer);
    process.off('SIGTERM', onSigterm);
    await worker.close();
    await analyticsWorker.close();
    await analyticsQueue.close();
    analyticsQueueConnection.disconnect();
    analyticsWorkerConnection.disconnect();
    connection.disconnect();
    await app.close();
  };
  const onSigterm = () => {void close().catch(error => console.error('worker shutdown failed', error))};
  process.once('SIGTERM', onSigterm);
  return {close};
}

if (process.argv[1]?.endsWith('/main.ts')) {
  void startWorker({env: process.env}).then(() => console.log(JSON.stringify({service: 'worker', status: 'READY'})))
    .catch(error => {console.error(error); process.exitCode = 1});
}
