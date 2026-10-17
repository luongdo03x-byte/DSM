import type {Repositories} from '../../../../packages/shared/src/repositories.ts';
import type {JobQueue} from '../../../../packages/shared/src/job-queue.ts';

export const STALE_PROCESSING_MS = 10 * 60_000;

export class RecoveryService {
  private readonly repos: Repositories;
  constructor(repos: Repositories) {this.repos = repos}

  async requeueMissing(queue: JobQueue, now = Date.now()): Promise<number> {
    let count = 0;
    const recovered = new Set<string>();
    for (const job of await this.repos.publishJobs.findBy({status: 'PROCESSING'})) {
      if(job.strategy==='API'&&job.remoteCorrelationId){await queue.schedulePoll(job.id,Math.max(now,job.scheduledAt));count++;continue}
      if ((job.processingStartedAt ?? job.scheduledAt) > now - STALE_PROCESSING_MS) continue;
      if (!await this.repos.publishJobs.claim(job.id, ['PROCESSING'], 'RETRYING')) continue;
      await this.repos.publishJobs.update(job.id, {scheduledAt: now});
      await queue.reschedule(job.id, now);
      recovered.add(job.id);
      count++;
    }
    for (const job of await this.repos.publishJobs.findBy({status: 'QUEUED'})) {
      await queue.schedule(job.id, job.scheduledAt);
      count++;
    }
    for (const job of await this.repos.publishJobs.findBy({status: 'RETRYING'})) {
      if (recovered.has(job.id)) continue;
      await queue.reschedule(job.id, job.scheduledAt);
      count++;
    }
    return count;
  }
}
