import type {Repositories} from '../../../../../packages/shared/src/repositories.ts';
import type {AuditService} from '../audit/audit.service.ts';

export class BatchStatusService {
  private readonly repos: Repositories;
  private readonly audit: AuditService | undefined;
  constructor(repos: Repositories, audit?: AuditService) {this.repos = repos; this.audit = audit}

  async get(batchId: string) {
    const jobs = await this.repos.publishJobs.findBy({batchId});
    const statuses = new Set(jobs.map(job => job.status));
    if (!jobs.length) return 'QUEUED';
    if (statuses.size === 1) {
      const only = jobs[0]!.status;
      return only === 'RETRYING' ? 'PROCESSING' : only;
    }
    if (statuses.has('PUBLISHED')) return 'PARTIAL';
    if (statuses.has('PROCESSING') || statuses.has('RETRYING')) return 'PROCESSING';
    if (statuses.has('FAILED')) return 'FAILED';
    return 'PARTIAL';
  }

  async reschedule(jobId: string, when: number) {
    const job = await this.repos.publishJobs.get(jobId);
    if (!job) throw new Error('JOB_NOT_FOUND');
    if (job.status === 'PROCESSING' || job.status === 'PUBLISHED') throw new Error('CONFLICT');
    return this.repos.publishJobs.update(jobId, {scheduledAt: when, status: 'QUEUED'});
  }

  async cancel(jobId: string) {
    const job = await this.repos.publishJobs.get(jobId);
    if (!job) throw new Error('JOB_NOT_FOUND');
    if (job.status === 'PROCESSING' || job.status === 'PUBLISHED') throw new Error('CONFLICT');
    return this.repos.publishJobs.update(jobId, {status: 'CANCELLED'});
  }

  async manualRetry(jobId: string, userId?: string) {
    const job = await this.repos.publishJobs.get(jobId);
    if (!job) throw new Error('JOB_NOT_FOUND');
    if (['PUBLISHED', 'CANCELLED', 'PROCESSING'].includes(job.status)) throw new Error('RETRY_NOT_ALLOWED');
    const workspaceId = this.audit ? await this.audit.workspaceForBrand(job.brandId) : undefined;
    return this.repos.transaction(async tx => {
      const changed = await tx.publishJobs.update(jobId, {status: 'RETRYING', scheduledAt: Date.now()});
      if (this.audit && workspaceId) await this.audit.record({workspaceId, ...(userId ? {userId} : {}),
        action: 'PUBLISH_RETRY', entityType: 'PUBLISH_JOB', entityId: job.id}, tx);
      return changed;
    });
  }
}
