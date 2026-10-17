import {Worker} from 'bullmq';
import IORedis from 'ioredis';
import type {PublisherRegistry} from '../../api/src/modules/publishing/publisher-registry.ts';
import {createRuntime} from '../../api/src/runtime/dev-runtime.ts';
import {BullJobQueue, PUBLISH_API_QUEUE} from './queue/bull-job-queue.ts';
import {JobRunner} from './publishing/job-runner.service.ts';
import {PublishInputBuilder} from './publishing/publish-input.builder.ts';
import {RecoveryService} from './maintenance/recovery.service.ts';

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
  const runner = new JobRunner(app.repos, options.registry ?? app.registry);
  const builder = new PublishInputBuilder(app.repos, app.services.media);
  const recovery = new RecoveryService(app.repos);
  const concurrency = Math.max(1, Number(env.WORKER_CONCURRENCY ?? 4));
  const worker = new Worker(name, async job => runner.run(String(job.data.jobId), current => builder.build(current)),
    {connection, concurrency, autorun: false});
  worker.on('completed', (job, status) => {
    if (status !== 'RETRYING') return;
    void app.repos.publishJobs.get(String(job.data.jobId)).then(current => {
      if (current?.status === 'RETRYING') return queue.reschedule(current.id, current.scheduledAt);
    }).catch(error => console.error('worker retry scheduling failed', error));
  });
  worker.on('error', error => console.error('worker error', error));
  try {
    await recovery.requeueMissing(queue);
    void worker.run().catch(error => console.error('worker run failed', error));
  } catch (error) {
    await worker.close();
    connection.disconnect();
    await app.close();
    throw error;
  }
  const timer = setInterval(() => {void recovery.requeueMissing(queue).catch(error => console.error('worker recovery failed', error))}, 60_000);
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    clearInterval(timer);
    process.off('SIGTERM', onSigterm);
    await worker.close();
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
