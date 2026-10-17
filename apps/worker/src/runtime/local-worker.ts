import type {Repositories} from '../../../../packages/shared/src/repositories.ts';
import type {PublisherRegistry} from '../../../api/src/modules/publishing/publisher-registry.ts';
import type {MediaService} from '../../../api/src/modules/media/media.service.ts';
import {JobRunner} from '../publishing/job-runner.service.ts';
import {PublishInputBuilder} from '../publishing/publish-input.builder.ts';
import {MetricsSyncService} from '../analytics/metrics-sync.service.ts';

export function metricsCaptureKey(now = Date.now()) {
  const date = new Date(now);
  date.setUTCMinutes(0, 0, 0);
  return `${date.toISOString().slice(0, 13)}:00Z`;
}

export class LocalWorkerRuntime {
  private readonly repos: Repositories;
  private readonly runner: JobRunner;
  private readonly builder: PublishInputBuilder;
  private readonly metrics: MetricsSyncService;
  constructor(repos: Repositories, registry: PublisherRegistry, media: MediaService) {
    this.repos = repos;
    this.runner = new JobRunner(repos, registry);
    this.builder = new PublishInputBuilder(repos, media);
    this.metrics = new MetricsSyncService(repos, registry);
  }

  async tick(now = Date.now()) {
    const due = await this.repos.publishJobs.findDue(now, 20);
    let count = 0;
    for (const job of due) {
      const result = await this.runner.run(job.id, current => this.builder.build(current));
      if (result !== 'SKIPPED') count++;
    }
    for(const job of await this.repos.publishJobs.findBy({status:'PROCESSING'})){
      if(job.strategy==='API'&&job.remoteCorrelationId&&job.scheduledAt<=now){await this.runner.poll(job.id);count++}
    }
    return count;
  }

  async syncMetrics(captureKey: string) {
    const capturedAt = Date.parse(captureKey);
    if (!Number.isFinite(capturedAt)) throw new Error('INVALID_CAPTURE_KEY');
    let count = 0;
    for (const post of await this.repos.publishedPosts.findBy({})) {
      if ((await this.repos.postMetrics.findBy({publishedPostId: post.id, captureKey})).length) continue;
      await this.metrics.sync(post.id, captureKey, capturedAt);
      count++;
    }
    return count;
  }
}
