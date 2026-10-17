import {Queue} from 'bullmq';
import IORedis from 'ioredis';
import type {JobQueue} from '../../../../packages/shared/src/job-queue.ts';

export const PUBLISH_API_QUEUE = 'dsm-publish-api';

export class BullJobQueue implements JobQueue {
  private readonly connection: IORedis;
  private readonly queue: Queue;
  constructor(connection: {url: string}, queueName = PUBLISH_API_QUEUE) {
    this.connection = new IORedis(connection.url, {maxRetriesPerRequest: null});
    this.queue = new Queue(queueName, {connection: this.connection});
  }
  async schedule(jobId: string, runAt: number): Promise<void> {
    const existing = await this.queue.getJob(jobId);
    if (existing) {
      const state = await existing.getState();
      if (state !== 'completed' && state !== 'failed') return;
      await existing.remove();
    }
    await this.queue.add('publish', {jobId}, {jobId, delay: Math.max(0, runAt - Date.now()), attempts: 1,
      removeOnComplete: 1000, removeOnFail: 5000});
  }
  async reschedule(jobId: string, runAt: number): Promise<void> {
    const job = await this.queue.getJob(jobId);
    if (job && await job.getState() === 'active') return;
    await this.cancel(jobId);
    await this.schedule(jobId, runAt);
  }
  async cancel(jobId: string): Promise<void> {
    const job = await this.queue.getJob(jobId);
    if (job && await job.getState() !== 'active') {
      try {await job.remove()}
      catch (error) {
        if (await job.getState() !== 'active') throw error;
      }
    }
  }
  async close(): Promise<void> {
    await this.queue.close();
    this.connection.disconnect();
  }
}
