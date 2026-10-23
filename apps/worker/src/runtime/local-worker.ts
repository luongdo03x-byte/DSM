import type {Repositories} from '../../../../packages/shared/src/repositories.ts';
import type {PublisherRegistry} from '../../../api/src/modules/publishing/publisher-registry.ts';
import type {MediaService} from '../../../api/src/modules/media/media.service.ts';
import {JobRunner} from '../publishing/job-runner.service.ts';
import {PublishInputBuilder} from '../publishing/publish-input.builder.ts';
import {MetricsSyncService} from '../analytics/metrics-sync.service.ts';
import {runPendingMetaComments} from '../engagement/ingest-comment.job.ts';
import type {MemoryStore} from '../../../../packages/shared/src/store.ts';
import {pollComments,COMMENT_POLL_INTERVAL_MS} from '../engagement/poll-comments.job.ts';
import type {CommentSource} from '../../../../packages/platform-contracts/src/comments.ts';

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
  private readonly store:MemoryStore|undefined;
  private readonly commentSources:{YOUTUBE?:CommentSource};
  private lastCommentPollAt=0;
  constructor(repos: Repositories, registry: PublisherRegistry, media: MediaService,store?:MemoryStore) {
    this.repos = repos;
    this.runner = new JobRunner(repos, registry);
    this.builder = new PublishInputBuilder(repos, media);
    this.metrics = new MetricsSyncService(repos, registry);
    this.store=store;
    const youtube=registry.get('YOUTUBE','API');this.commentSources='listSince' in youtube&&'reply' in youtube?{YOUTUBE:youtube as unknown as CommentSource}:{};
  }

  async tick(now = Date.now()) {
    if(this.store)await runPendingMetaComments(this.store,this.repos);
    if(now-this.lastCommentPollAt>=COMMENT_POLL_INTERVAL_MS){this.lastCommentPollAt=now;await pollComments(this.repos,this.commentSources,now)}
    const due = await this.repos.publishJobs.findDue(now, 20);
    let count = 0;
    for (const job of due) {
      const result = await this.runner.run(job.id, current => this.builder.build(current));
      if (result !== 'SKIPPED') count++;
    }
    for(const job of await this.repos.publishJobs.findBy({status:'PROCESSING'})){
      if(job.strategy==='API'&&job.remoteCorrelationId&&!(job.platform==='YOUTUBE'&&job.remoteCorrelationId.startsWith('resumable:'))&&job.scheduledAt<=now){await this.runner.poll(job.id);count++}
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
