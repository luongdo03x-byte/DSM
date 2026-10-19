import {id} from '../../../../packages/shared/src/ids.ts';
import {PublishError} from '../../../../packages/platform-contracts/src/index.ts';
import type {PublishInput, PublishedPostData} from '../../../../packages/platform-contracts/src/index.ts';
import type {PublishJob} from '../../../../packages/shared/src/domain.ts';
import type {Repositories} from '../../../../packages/shared/src/repositories.ts';
import type {PublisherRegistry} from '../../../api/src/modules/publishing/publisher-registry.ts';
import type {JobQueue} from '../../../../packages/shared/src/job-queue.ts';
import type {PlatformAdapter} from '../../../../packages/platform-contracts/src/adapter.ts';
import {IG_CONTAINER_TIMEOUT_MS} from '../../../api/src/integrations/meta/instagram.adapter.ts';
import {RetryPolicy} from './retry-policy.ts';
import type {NotificationDispatcher} from '../notifications/notification-dispatcher.ts';

export const POLL_INTERVALS_MS=[5_000,10_000,20_000,30_000,60_000] as const;
export const POLL_LEASE_MS=60_000;
export type JobRunResult = 'PUBLISHED' | 'PROCESSING' | 'RETRYING' | 'FAILED' | 'SKIPPED';

export class JobRunner {
  private readonly repos: Repositories;
  private readonly registry: PublisherRegistry;
  private readonly retry: RetryPolicy;
  private readonly queue:JobQueue|undefined;
  private readonly now:()=>number;
  private readonly notifications:NotificationDispatcher|undefined;
  constructor(repos: Repositories, registry: PublisherRegistry, retry = new RetryPolicy(), queue?:JobQueue, now:()=>number=Date.now, notifications?:NotificationDispatcher) {
    this.repos = repos; this.registry = registry; this.retry = retry;this.queue=queue;this.now=now;this.notifications=notifications;
  }

  private async notifyFailure(job:PublishJob,errorCode:string,errorMessage:string){
    if(!this.notifications)return;
    try{const brand=await this.repos.brands.get(job.brandId),variant=await this.repos.variants.get(job.contentVariantId),content=variant?await this.repos.contents.get(variant.contentItemId):undefined;if(brand)await this.notifications.dispatch(brand.workspaceId,{kind:'JOB_FAILED',brandId:job.brandId,jobId:job.id,platform:job.platform,title:content?.title??'Bài viết',errorCode,errorMessage})}catch(error){console.error('notification dispatch failed',error)}
  }

  private nextPollAt(startedAt:number,now:number):number{
    const elapsed=Math.max(0,now-startedAt);let cumulative=0;
    for(const delay of POLL_INTERVALS_MS){cumulative+=delay;if(elapsed<cumulative)return startedAt+cumulative}
    return startedAt+cumulative+(Math.floor((elapsed-cumulative)/60_000)+1)*60_000;
  }
  private async schedulePoll(job:PublishJob,now:number){
    const runAt=this.nextPollAt(job.processingStartedAt??now,now);
    await this.repos.publishJobs.update(job.id,{scheduledAt:runAt});
    try{await this.queue?.schedulePoll(job.id,runAt)}catch(error){console.error('poll scheduling failed; recovery will reschedule',error)}
  }

  async poll(jobId:string):Promise<'PUBLISHED'|'PROCESSING'|'FAILED'>{
    const job=await this.repos.publishJobs.get(jobId);if(!job)throw new Error('JOB_NOT_FOUND');
    if(job.status==='PUBLISHED')return'PUBLISHED';if(job.status!=='PROCESSING'||!job.remoteCorrelationId)return'FAILED';
    const now=this.now();
    const claimed=await this.repos.publishJobs.claim(jobId,['PROCESSING'],'PROCESSING',{dueAt:now,patch:{scheduledAt:now+POLL_LEASE_MS}});
    if(!claimed)return(await this.repos.publishJobs.get(jobId))?.status==='PUBLISHED'?'PUBLISHED':'PROCESSING';
    if(now-(job.processingStartedAt??now)>IG_CONTAINER_TIMEOUT_MS){await this.repos.publishJobs.update(jobId,{status:'FAILED',errorCode:'PROCESSING_TIMEOUT',errorMessage:'Platform processing timed out'});await this.notifyFailure(job,'PROCESSING_TIMEOUT','Platform processing timed out');return'FAILED'}
    const adapter=this.registry.get(job.platform,job.strategy) as PlatformAdapter;
    if(typeof adapter.pollStatus!=='function'){await this.repos.publishJobs.update(jobId,{status:'FAILED',errorCode:'POLL_UNSUPPORTED'});await this.notifyFailure(job,'POLL_UNSUPPORTED','Không hỗ trợ kiểm tra trạng thái');return'FAILED'}
    try{
      const result=await adapter.pollStatus({socialAccountId:job.socialAccountId,remoteCorrelationId:job.remoteCorrelationId});
      if(result.externalPostId){await this.persistPost(job,{externalPostId:result.externalPostId,exists:true,...(result.externalUrl?{externalUrl:result.externalUrl}:{}),...(result.publishedAt?{publishedAt:result.publishedAt}:{})});return'PUBLISHED'}
      await this.schedulePoll(job,now);return'PROCESSING';
    }catch(raw){
      const error=raw as Error&{code?:string;retryable?:boolean};
      if(error.retryable){await this.schedulePoll(job,now);return'PROCESSING'}
      if((error as {type?:string}).type==='AUTH_ERROR')await this.repos.socialAccounts.update(job.socialAccountId,{status:'EXPIRED'});
      await this.repos.publishJobs.update(jobId,{status:'FAILED',errorCode:error.code??'PROCESSING_ERROR',errorMessage:String(error.message)});await this.notifyFailure(job,error.code??'PROCESSING_ERROR',String(error.message));return'FAILED';
    }
  }

  async run(jobId: string, buildInput: (job: PublishJob) => Promise<PublishInput>): Promise<JobRunResult> {
    const claimed = await this.repos.publishJobs.claim(jobId, ['QUEUED', 'RETRYING'], 'PROCESSING', {dueAt: Date.now()});
    if (!claimed) {
      if (!await this.repos.publishJobs.get(jobId)) throw new Error('JOB_NOT_FOUND');
      return 'SKIPPED';
    }
    await this.repos.publishJobs.update(jobId,{processingStartedAt:this.now()});
    const job = (await this.repos.publishJobs.get(jobId))!;
    const existing = (await this.repos.publishedPosts.findBy({publishJobId: jobId}))[0];
    if (existing) {
      await this.repos.publishJobs.update(jobId, {status: 'PUBLISHED'});
      return 'PUBLISHED';
    }

    const publisher = this.registry.get(job.platform, job.strategy);
    let correlationId = job.remoteCorrelationId;
    if (job.remoteCorrelationId) {
      try {
        const remote = await publisher.fetchPost(job.remoteCorrelationId, {socialAccountId: job.socialAccountId});
        if (remote.exists) {
          await this.persistPost(job, remote);
          return 'PUBLISHED';
        }
        if (job.strategy === 'BROWSER') {
          await this.repos.publishJobs.update(jobId, {status: 'RETRYING', scheduledAt: Date.now() + 30_000});
          return 'RETRYING';
        }
      } catch (error) {
        if (job.strategy !== 'BROWSER') throw error;
        const failure = error as Error & {code?: string; retryable?: boolean};
        const code = failure.code ?? 'BROWSER_OUTCOME_UNKNOWN';
        if (code === 'TASK_NOT_FOUND') {
          // The gateway journal has no acceptance record; submit the same correlation again.
        } else if (code === 'TASK_RETRYABLE_FAILURE') {
          // A definitive pre-submission failure may use a new attempt correlation.
          correlationId = `${job.id}:${job.attemptCount + 1}`;
        } else {
          const status = code === 'NODE_OFFLINE' || failure.retryable ? 'RETRYING' : 'FAILED';
          await this.repos.publishJobs.update(jobId, {status, errorCode: code, errorMessage: String(failure.message),
            ...(status === 'RETRYING' ? {scheduledAt: Date.now() + 30_000} : {})});
          if(status==='FAILED')await this.notifyFailure(job,code,String(failure.message));
          return status;
        }
      }
    }

    const attemptNumber = job.attemptCount + 1;
    const startedAt = this.now();
    await this.repos.publishJobs.update(jobId, {attemptCount: attemptNumber});
    try {
      if (job.strategy === 'BROWSER') {
        correlationId ??= `${job.id}:${attemptNumber}`;
        await this.repos.publishJobs.update(jobId, {remoteCorrelationId: correlationId});
      }
      const input=await buildInput(job.strategy === 'BROWSER' ? {...job, remoteCorrelationId: correlationId!} : job);
      if(job.strategy==='API'&&job.attemptCount>0){
        const prior=await this.repos.publishAttempts.findBy({publishJobId:jobId});
        const first=Math.min(...prior.map(attempt=>attempt.startedAt));
        if(Number.isFinite(first))input.metadata={...input.metadata,retrySince:Math.floor(first/1000)};
      }
      const result = await publisher.publish(input);
      if (result.remoteCorrelationId) await this.repos.publishJobs.update(jobId, {remoteCorrelationId: result.remoteCorrelationId});
      if (result.externalPostId) {
        await this.persistPost(job, {externalPostId: result.externalPostId, exists: true, ...(result.externalUrl ? {externalUrl: result.externalUrl} : {}), ...(result.publishedAt ? {publishedAt: result.publishedAt} : {})});
        await this.repos.publishAttempts.append({id: id('attempt'), publishJobId: jobId, attemptNumber, strategy: job.strategy, startedAt, finishedAt: Date.now(), status: 'PUBLISHED'});
        return 'PUBLISHED';
      }
      if (result.processing && result.remoteCorrelationId) {
        await this.repos.publishJobs.update(jobId, {status: 'PROCESSING'});
        await this.schedulePoll({...job,processingStartedAt:startedAt},this.now());
        await this.repos.publishAttempts.append({id: id('attempt'), publishJobId: jobId, attemptNumber, strategy: job.strategy, startedAt, finishedAt: this.now(), status: 'PROCESSING'});
        return 'PROCESSING';
      }
      throw new PublishError({type: 'PLATFORM_ERROR', code: 'NO_POST_ID', message: 'No post id', retryable: true});
    } catch (raw: unknown) {
      const failure = raw as Error & {code?: string; retryable?: boolean};
      const error = raw instanceof PublishError ? raw : new PublishError({type: 'UNKNOWN', code: failure?.code ?? 'UNKNOWN', message: String(failure?.message ?? raw), retryable: failure?.retryable ?? false});
      if(error.type==='AUTH_ERROR')await this.repos.socialAccounts.update(job.socialAccountId,{status:'EXPIRED'});
      if(job.platform==='INSTAGRAM'&&error.code==='IG_DAILY_LIMIT'&&error.retryAfterMs){
        await this.repos.publishJobs.update(jobId,{status:'RETRYING',attemptCount:job.attemptCount,errorCode:error.code,errorMessage:error.message,scheduledAt:Date.now()+error.retryAfterMs});
        return'RETRYING';
      }
      const decision = this.retry.decide(error, attemptNumber);
      const status = decision.retry ? 'RETRYING' : 'FAILED';
      await this.repos.publishJobs.update(jobId, {status, errorCode: error.code, errorMessage: error.message, ...(decision.retry ? {scheduledAt: Date.now() + (decision.delayMs ?? 0)} : {})});
      await this.repos.publishAttempts.append({id: id('attempt'), publishJobId: jobId, attemptNumber, strategy: job.strategy, startedAt, finishedAt: Date.now(), status: 'FAILED', errorType: error.type, errorCode: error.code, errorMessage: error.message});
      if(status==='FAILED')await this.notifyFailure(job,error.code,error.message);
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
