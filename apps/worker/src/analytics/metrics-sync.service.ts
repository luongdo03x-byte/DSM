import {id} from '../../../../packages/shared/src/ids.ts';
import type {Repositories} from '../../../../packages/shared/src/repositories.ts';
import type {PublisherRegistry} from '../../../api/src/modules/publishing/publisher-registry.ts';

export class MetricsSyncService {
  private readonly repos: Repositories;
  private readonly registry: PublisherRegistry;
  constructor(repos: Repositories, registry: PublisherRegistry) {this.repos = repos; this.registry = registry}

  async sync(publishedPostId: string, captureKey: string, capturedAt = Date.now()) {
    const existing = (await this.repos.postMetrics.findBy({publishedPostId, captureKey}))[0];
    if (existing) return existing;
    const post = await this.repos.publishedPosts.get(publishedPostId);
    if (!post) throw new Error('POST_NOT_FOUND');
    const job = await this.repos.publishJobs.get(post.publishJobId);
    if (!job) throw new Error('JOB_NOT_FOUND');
    const metrics = await this.registry.get(post.platform, job.strategy).fetchMetrics(post.platformPostId, {socialAccountId: post.socialAccountId});
    const row = {id: id('metric'), publishedPostId, capturedAt, captureKey,
      ...(metrics.views !== undefined ? {views: metrics.views} : {}), ...(metrics.likes !== undefined ? {likes: metrics.likes} : {}),
      ...(metrics.comments !== undefined ? {comments: metrics.comments} : {}), ...(metrics.shares !== undefined ? {shares: metrics.shares} : {}),
      ...(metrics.saves !== undefined ? {saves: metrics.saves} : {}), rawMetrics: metrics.raw};
    await this.repos.postMetrics.append(row);
    return row;
  }
}
