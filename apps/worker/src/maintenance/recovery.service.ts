import type {Repositories} from '../../../../packages/shared/src/repositories.ts';
import type {PublishQueueService} from '../../../api/src/modules/publishing/publish-queue.service.ts';

export class RecoveryService {
  private readonly repos: Repositories;
  private readonly queue: PublishQueueService;
  constructor(repos: Repositories, queue: PublishQueueService) {this.repos = repos; this.queue = queue}

  async recoverDueJobs(now = Date.now()): Promise<number> {
    let count = 0;
    for (const job of await this.repos.publishJobs.findDue(now, 1000)) {
      const target = job.strategy === 'API' ? this.queue.api : this.queue.browser;
      if (!target.has(job.id)) {this.queue.enqueue(job.id); count++}
    }
    return count;
  }
}
