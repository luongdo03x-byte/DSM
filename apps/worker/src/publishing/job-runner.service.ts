import {id} from '../../../../packages/shared/src/ids.ts';
import {PublishError} from '../../../../packages/platform-contracts/src/index.ts';
import type {PublishInput, PublishedPostData} from '../../../../packages/platform-contracts/src/index.ts';
import type {PublishJob} from '../../../../packages/shared/src/domain.ts';
import type {Repositories} from '../../../../packages/shared/src/repositories.ts';
import type {PublisherRegistry} from '../../../api/src/modules/publishing/publisher-registry.ts';
import {RetryPolicy} from './retry-policy.ts';

export type JobRunResult = 'PUBLISHED' | 'RETRYING' | 'FAILED' | 'SKIPPED';

export class JobRunner {
  private readonly repos: Repositories;
  private readonly registry: PublisherRegistry;
  private readonly retry: RetryPolicy;
  constructor(repos: Repositories, registry: PublisherRegistry, retry = new RetryPolicy()) {
    this.repos = repos; this.registry = registry; this.retry = retry;
  }

  async run(jobId: string, buildInput: (job: PublishJob) => Promise<PublishInput>): Promise<JobRunResult> {
    const claimed = await this.repos.publishJobs.claim(jobId, ['QUEUED', 'RETRYING'], 'PROCESSING');
    if (!claimed) {
      if (!await this.repos.publishJobs.get(jobId)) throw new Error('JOB_NOT_FOUND');
      return 'SKIPPED';
    }
    const job = (await this.repos.publishJobs.get(jobId))!;
    const existing = (await this.repos.publishedPosts.findBy({publishJobId: jobId}))[0];
    if (existing) {
      await this.repos.publishJobs.update(jobId, {status: 'PUBLISHED'});
      return 'PUBLISHED';
    }

    const publisher = this.registry.get(job.platform, job.strategy);
    if (job.remoteCorrelationId) {
      const remote = await publisher.fetchPost(job.remoteCorrelationId, {socialAccountId: job.socialAccountId});
      if (remote.exists) {
        await this.persistPost(job, remote);
        return 'PUBLISHED';
      }
    }

    const attemptNumber = job.attemptCount + 1;
    const startedAt = Date.now();
    await this.repos.publishJobs.update(jobId, {attemptCount: attemptNumber});
    try {
      const result = await publisher.publish(await buildInput(job));
      if (result.remoteCorrelationId) await this.repos.publishJobs.update(jobId, {remoteCorrelationId: result.remoteCorrelationId});
      if (result.externalPostId) {
        await this.persistPost(job, {externalPostId: result.externalPostId, exists: true, ...(result.externalUrl ? {externalUrl: result.externalUrl} : {}), ...(result.publishedAt ? {publishedAt: result.publishedAt} : {})});
        await this.repos.publishAttempts.append({id: id('attempt'), publishJobId: jobId, attemptNumber, strategy: job.strategy, startedAt, finishedAt: Date.now(), status: 'PUBLISHED'});
        return 'PUBLISHED';
      }
      if (result.processing && result.remoteCorrelationId) {
        await this.repos.publishJobs.update(jobId, {status: 'RETRYING', scheduledAt: Date.now() + 30_000});
        await this.repos.publishAttempts.append({id: id('attempt'), publishJobId: jobId, attemptNumber, strategy: job.strategy, startedAt, finishedAt: Date.now(), status: 'RETRYING'});
        return 'RETRYING';
      }
      throw new PublishError({type: 'PLATFORM_ERROR', code: 'NO_POST_ID', message: 'No post id', retryable: true});
    } catch (raw: unknown) {
      const error = raw instanceof PublishError ? raw : new PublishError({type: 'UNKNOWN', code: 'UNKNOWN', message: String((raw as Error)?.message ?? raw), retryable: false});
      const decision = this.retry.decide(error, attemptNumber);
      const status = decision.retry ? 'RETRYING' : 'FAILED';
      await this.repos.publishJobs.update(jobId, {status, errorCode: error.code, errorMessage: error.message, ...(decision.retry ? {scheduledAt: Date.now() + (decision.delayMs ?? 0)} : {})});
      await this.repos.publishAttempts.append({id: id('attempt'), publishJobId: jobId, attemptNumber, strategy: job.strategy, startedAt, finishedAt: Date.now(), status: 'FAILED', errorType: error.type, errorCode: error.code, errorMessage: error.message});
      return status;
    }
  }

  private async persistPost(job: PublishJob, remote: PublishedPostData): Promise<void> {
    const existing = (await this.repos.publishedPosts.findBy({publishJobId: job.id}))[0];
    if (existing) {
      await this.repos.publishJobs.update(job.id, {status: 'PUBLISHED'});
      return;
    }
    await this.repos.transaction(async tx => {
      await tx.publishedPosts.insert({
        id: id('post'), brandId: job.brandId, publishJobId: job.id, socialAccountId: job.socialAccountId,
        contentVariantId: job.contentVariantId, platform: job.platform, platformPostId: remote.externalPostId,
        publishedAt: remote.publishedAt ?? Date.now(),
        ...(remote.externalUrl ? {platformPostUrl: remote.externalUrl} : {}),
      });
      await tx.publishJobs.update(job.id, {status: 'PUBLISHED'});
    });
  }
}
