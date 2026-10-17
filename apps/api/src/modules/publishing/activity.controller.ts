import type {Repositories} from '../../../../../packages/shared/src/repositories.ts';
import {BatchStatusService} from './batch-status.service.ts';

export class PublishingActivityController {
  private readonly repos: Repositories;
  private readonly status: BatchStatusService;
  constructor(repos: Repositories) {this.repos = repos; this.status = new BatchStatusService(repos)}

  async batch(batchId: string) {
    const jobs = await this.repos.publishJobs.findBy({batchId});
    const decorated = await Promise.all(jobs.map(async job => ({...job, attempts: await this.repos.publishAttempts.findBy({publishJobId: job.id})})));
    return {batchId, status: await this.status.get(batchId), jobs: decorated};
  }

  async retry(jobId: string) {return this.status.manualRetry(jobId)}
}
