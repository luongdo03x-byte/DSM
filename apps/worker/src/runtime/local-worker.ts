import type {MemoryStore} from '../../../../packages/shared/src/store.ts';
import type {PublisherRegistry} from '../../../api/src/modules/publishing/publisher-registry.ts';
import type {MediaService} from '../../../api/src/modules/media/media.service.ts';
import {JobRunner} from '../publishing/job-runner.service.ts';
import {PublishInputBuilder} from '../publishing/publish-input.builder.ts';
import {id} from '../../../../packages/shared/src/ids.ts';

export function metricsCaptureKey(now=Date.now()){const d=new Date(now);d.setUTCMinutes(0,0,0);return `${d.toISOString().slice(0,13)}:00Z`}

export class LocalWorkerRuntime{
  private store:MemoryStore;private registry:PublisherRegistry;private runner:JobRunner;private builder:PublishInputBuilder;
  constructor(store:MemoryStore,registry:PublisherRegistry,media:MediaService){this.store=store;this.registry=registry;this.runner=new JobRunner(store,registry);this.builder=new PublishInputBuilder(store,media)}
  async tick(now=Date.now()){let count=0;const due=[...this.store.publishJobs.values()].filter(j=>(j.status==='QUEUED'||j.status==='RETRYING')&&j.scheduledAt<=now).sort((a,b)=>a.scheduledAt-b.scheduledAt);for(const job of due){await this.runner.run(job.id,j=>this.builder.build(j));count++}return count}
  async syncMetrics(captureKey:string){const capturedAt=Date.parse(captureKey);if(!Number.isFinite(capturedAt))throw new Error('INVALID_CAPTURE_KEY');let count=0;for(const post of this.store.publishedPosts.values()){if(this.store.postMetrics.some(m=>m.publishedPostId===post.id&&m.captureKey===captureKey))continue;const job=this.store.publishJobs.get(post.publishJobId);if(!job)continue;const publisher=this.registry.get(job.platform,job.strategy);const metrics=await publisher.fetchMetrics(post.platformPostId,{socialAccountId:post.socialAccountId});this.store.postMetrics.push({id:id('metric'),publishedPostId:post.id,capturedAt,captureKey,...(metrics.views!==undefined?{views:metrics.views}:{}),...(metrics.likes!==undefined?{likes:metrics.likes}:{}),...(metrics.comments!==undefined?{comments:metrics.comments}:{}),...(metrics.shares!==undefined?{shares:metrics.shares}:{}),...(metrics.saves!==undefined?{saves:metrics.saves}:{}),rawMetrics:metrics.raw});count++}return count}
}
