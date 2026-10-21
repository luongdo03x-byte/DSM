import type {ContentFormat, ContentType, ContentVariant, JobStatus, Platform, PublishJob} from '../../../../../packages/shared/src/domain.ts';
import type {Repositories} from '../../../../../packages/shared/src/repositories.ts';
import type {JobQueue} from '../../../../../packages/shared/src/job-queue.ts';
import {id} from '../../../../../packages/shared/src/ids.ts';
import {sha256} from '../../../../../packages/shared/src/security.ts';
import {PublisherRegistry} from './publisher-registry.ts';
import {StrategyResolver} from './strategy-resolver.ts';
import {ContentService} from '../content/content.service.ts';

type ValidationInput = {brandId: string; contentId: string; socialAccountIds: string[]; apiHealth?: Record<string, boolean>; browserHealth?: Record<string, boolean>};
export const MAX_SCHEDULE_AHEAD_DAYS=75;
export const YOUTUBE_EARLY_UPLOAD_MS=15*60_000;
export interface CalendarEntry {jobId:string;contentItemId:string;title:string;platform:Platform;socialAccountId:string;format?:ContentFormat;scheduledAt:number;status:JobStatus;publishedUrl?:string;errorCode?:string;statusLabel?:string;warning?:string}

export class PublishingService {
  private readonly repos: Repositories;
  private readonly registry: PublisherRegistry;
  private readonly resolver: StrategyResolver;
  private readonly queue: JobQueue | undefined;
  private readonly publicMediaBaseUrl:string|undefined;
  constructor(repos: Repositories, registry: PublisherRegistry, resolver: StrategyResolver, queue?: JobQueue,options:{publicMediaBaseUrl?:string}={}) {
    this.repos = repos; this.registry = registry; this.resolver = resolver; this.queue = queue;this.publicMediaBaseUrl=options.publicMediaBaseUrl;
  }

  async listCalendar(brandId:string,from:number,to:number):Promise<CalendarEntry[]>{
    if(!Number.isFinite(from)||!Number.isFinite(to)||from>=to)throw new Error('INVALID_CALENDAR_RANGE');
    const jobs=(await this.repos.publishJobs.findInRange(brandId,from,to)).filter(job=>(job.publishAt??job.scheduledAt)<to);
    return Promise.all(jobs.map(job=>this.calendarEntry(job)));
  }

  async reschedule(brandId:string,jobId:string,scheduledAt:number,now:number):Promise<CalendarEntry>{
    const job=await this.repos.publishJobs.get(jobId);
    if(!job||job.brandId!==brandId)throw new Error('JOB_NOT_FOUND');
    const uploaded=job.platform==='YOUTUBE'&&job.status==='PROCESSING'&&job.remoteCorrelationId?.startsWith('video:');
    if(!uploaded&&!['QUEUED','RETRYING'].includes(job.status))throw new Error('JOB_NOT_RESCHEDULABLE');
    if(!Number.isFinite(scheduledAt)||scheduledAt<now+5*60_000)throw new Error('SCHEDULE_TOO_SOON');
    if(scheduledAt>now+MAX_SCHEDULE_AHEAD_DAYS*24*60*60_000)throw new Error('SCHEDULE_TOO_FAR');
    if(uploaded){const adapter=this.registry.get('YOUTUBE','API') as {reschedule?:(input:{socialAccountId:string;videoId:string;publishAt:number})=>Promise<void>};if(!adapter.reschedule)throw new Error('JOB_NOT_RESCHEDULABLE');await adapter.reschedule({socialAccountId:job.socialAccountId,videoId:job.remoteCorrelationId!.slice(6),publishAt:scheduledAt});await this.repos.publishJobs.update(jobId,{publishAt:scheduledAt,scheduledAt:scheduledAt+60_000});await this.queue?.schedulePoll(jobId,scheduledAt+60_000)}
    else{const variant=job.platform==='YOUTUBE'?await this.repos.variants.get(job.contentVariantId):undefined;const early=job.platform==='YOUTUBE'&&job.strategy==='API'&&variant?.youtube?.privacyStatus==='public'&&scheduledAt>now+YOUTUBE_EARLY_UPLOAD_MS,runAt=early?now:scheduledAt;if(!await this.repos.publishJobs.claim(jobId,['QUEUED','RETRYING'],'QUEUED',{patch:{scheduledAt:runAt,publishAt:early?scheduledAt:null}}))throw new Error('JOB_NOT_RESCHEDULABLE');await this.queue?.reschedule(jobId,runAt)}
    return this.calendarEntry((await this.repos.publishJobs.get(jobId))!);
  }

  private async calendarEntry(job:PublishJob):Promise<CalendarEntry>{
    const batch=await this.repos.publishBatches.get(job.batchId);
    const content=batch?await this.repos.contents.get(batch.contentItemId):undefined;
    const variant=await this.repos.variants.get(job.contentVariantId);
    const published=(await this.repos.publishedPosts.findBy({publishJobId:job.id}))[0];
    const warning=(await this.repos.publishAttempts.findBy({publishJobId:job.id})).map(row=>row.metadata?.note).find(note=>typeof note==='string');
    return{jobId:job.id,contentItemId:batch?.contentItemId??variant?.contentItemId??'',title:content?.title??'',platform:job.platform,socialAccountId:job.socialAccountId,...(variant?.format?{format:variant.format}:{}),scheduledAt:job.publishAt??job.scheduledAt,status:job.status,...(job.platform==='YOUTUBE'&&job.status==='PROCESSING'&&job.remoteCorrelationId?.startsWith('video:')?{statusLabel:'Đã tải lên, chờ YouTube công bố'}:{}),...(published?.platformPostUrl?{publishedUrl:published.platformPostUrl}:{}),...(job.errorCode?{errorCode:job.errorCode}:{}),...(typeof warning==='string'?{warning}:{})};
  }

  async validateTargets(input: ValidationInput) {
    const content = await this.repos.contents.get(input.contentId);
    if (!content || content.brandId !== input.brandId) throw new Error('CONTENT_NOT_FOUND');
    const results: Array<{socialAccountId: string; platform: Platform; valid: boolean; errors: string[]; warnings: string[]; strategy?: 'API' | 'BROWSER'; contentVariantId?: string}> = [];
    for (const accountId of input.socialAccountIds) {
      const account = await this.repos.socialAccounts.get(accountId);
      if (!account || account.brandId !== input.brandId) {
        results.push({socialAccountId: accountId, platform: 'TIKTOK', valid: false, errors: ['ACCOUNT_NOT_FOUND'], warnings: []});
        continue;
      }
      const variant = (await this.repos.variants.findBy({contentItemId: content.id, platform: account.platform}))[0];
      if (variant?.skippedReason) {
        results.push({socialAccountId: accountId, platform: account.platform, valid: false, errors: ['VARIANT_SKIPPED'], warnings: []});
        continue;
      }
      if (!variant || variant.status !== 'READY') {
        results.push({socialAccountId: accountId, platform: account.platform, valid: false, errors: ['VARIANT_NOT_READY'], warnings: []});
        continue;
      }
      const preflightIssues = await new ContentService(this.repos,undefined,{publicMediaBaseUrl:this.publicMediaBaseUrl??''}).preflightVariant(input.brandId,variant.id);
      const preflightErrors = preflightIssues.filter(issue=>issue.severity==='error').map(issue=>issue.code);
      const preflightWarnings = preflightIssues.filter(issue=>issue.severity==='warning').map(issue=>issue.code);
      const warnings = (extra:string[]=[])=>[...new Set([...preflightWarnings,...extra])];
      if (preflightErrors.length) {
        results.push({socialAccountId:accountId,platform:account.platform,valid:false,errors:preflightErrors,warnings:preflightWarnings});
        continue;
      }
      const api = this.tryPublisher(account.platform, 'API'), browser = this.tryPublisher(account.platform, 'BROWSER'), contentType = content.type as ContentType;
      const apiResult = api ? await api.validate(this.toInput(input.brandId, account.id, variant, contentType)) : undefined;
      const browserResult = browser ? await browser.validate(this.toInput(input.brandId, account.id, variant, contentType)) : undefined;
      if (account.publishMode === 'API' && apiResult && !apiResult.valid) {
        results.push({socialAccountId: accountId, platform: account.platform, valid: false, errors: apiResult.errors, warnings: warnings(apiResult.warnings)});
        continue;
      }
      if (account.publishMode === 'BROWSER' && browserResult && !browserResult.valid) {
        results.push({socialAccountId: accountId, platform: account.platform, valid: false, errors: browserResult.errors, warnings: warnings(browserResult.warnings)});
        continue;
      }
      if (account.publishMode === 'HYBRID' && apiResult && !apiResult.valid && browserResult && !browserResult.valid) {
        results.push({socialAccountId: accountId, platform: account.platform, valid: false, errors: [...new Set([...apiResult.errors, ...browserResult.errors])], warnings: warnings([...apiResult.warnings, ...browserResult.warnings])});
        continue;
      }
      if (account.publishMode === 'HYBRID' && apiResult && !apiResult.valid && !browserResult) {
        results.push({socialAccountId: accountId, platform: account.platform, valid: false, errors: apiResult.errors, warnings: warnings(apiResult.warnings)});
        continue;
      }
      if (account.publishMode === 'HYBRID' && browserResult && !browserResult.valid && !apiResult) {
        results.push({socialAccountId: accountId, platform: account.platform, valid: false, errors: browserResult.errors, warnings: warnings(browserResult.warnings)});
        continue;
      }
      let strategy: 'API' | 'BROWSER';
      try {
        strategy = this.resolver.resolve({publishMode: account.publishMode, contentType,
          apiCredentialHealthy: input.apiHealth?.[account.id] ?? account.status === 'CONNECTED',
          apiCapability: !!api && !!apiResult?.valid,
          browserCapability: !!browser && !!browserResult?.valid,
          browserNodeHealthy: input.browserHealth?.[account.id] ?? !!account.browserProfileId});
      } catch (error: any) {
        results.push({socialAccountId: accountId, platform: account.platform, valid: false, errors: [error.code ?? String(error.message ?? 'VALIDATION')], warnings: warnings()});
        continue;
      }
      const selected = strategy === 'API' ? apiResult : browserResult;
      results.push({socialAccountId: accountId, platform: account.platform, valid: true, errors: [], warnings: warnings(selected?.warnings), strategy, contentVariantId: variant.id});
    }
    return results;
  }

  async createBatch(input: ValidationInput & {createdBy: string; scheduledAt?: number}) {
    const content = await this.repos.contents.get(input.contentId);
    if (!content || content.brandId !== input.brandId) throw new Error('CONTENT_NOT_FOUND');
    const validation = await this.validateTargets(input);
    const scheduledAt = input.scheduledAt ?? Date.now();
    const create = async (repos: Repositories) => {
      const existingByAccount = new Map<string, PublishJob>();
      for (const result of validation) {
        if (!result.valid || !result.contentVariantId) continue;
        const key = await sha256([input.brandId, result.socialAccountId, result.contentVariantId, new Date(scheduledAt).toISOString()].join('|'));
        const existing = (await repos.publishJobs.findBy({idempotencyKey: key}))[0];
        if (existing) existingByAccount.set(result.socialAccountId, existing);
      }
      const valid = validation.filter(result => result.valid);
      const originalBatchIds = new Set([...existingByAccount.values()].map(job => job.batchId));
      if (existingByAccount.size && (existingByAccount.size !== valid.length || originalBatchIds.size !== 1)) throw new Error('IDEMPOTENCY_CONFLICT');
      const batchId = originalBatchIds.values().next().value ?? id('batch');
      if (!existingByAccount.size) await repos.publishBatches.insert({id: batchId, brandId: input.brandId, contentItemId: content.id, createdBy: input.createdBy, createdAt: Date.now()});
      const results: Array<{socialAccountId: string; platform: Platform; valid: boolean; errors: string[]; warnings: string[]; jobId?: string; strategy?: 'API' | 'BROWSER'; contentVariantId?: string}> = [];
      const jobsToSchedule: PublishJob[] = [];
      for (const result of validation) {
        if (!result.valid || !result.strategy || !result.contentVariantId) {results.push(result); continue}
        const key = await sha256([input.brandId, result.socialAccountId, result.contentVariantId, new Date(scheduledAt).toISOString()].join('|'));
        const existing = existingByAccount.get(result.socialAccountId);
        const selectedVariant=result.platform==='YOUTUBE'?await repos.variants.get(result.contentVariantId):undefined;const early=result.platform==='YOUTUBE'&&result.strategy==='API'&&selectedVariant?.youtube?.privacyStatus==='public'&&scheduledAt>Date.now()+YOUTUBE_EARLY_UPLOAD_MS;
        const job: PublishJob = existing ?? {id: id('job'), batchId, brandId: input.brandId, socialAccountId: result.socialAccountId,
          contentVariantId: result.contentVariantId, platform: result.platform, strategy: result.strategy, scheduledAt:early?Date.now():scheduledAt,...(early?{publishAt:scheduledAt}:{}),
          status: 'QUEUED', attemptCount: 0, maxAttempts: 4, idempotencyKey: key};
        if (!existing) await repos.publishJobs.insert(job);
        if (job.status === 'QUEUED' || job.status === 'RETRYING') jobsToSchedule.push(job);
        results.push({socialAccountId: result.socialAccountId, platform: result.platform, valid: true, errors: [], warnings: result.warnings, jobId: job.id});
      }
      return {batchId, results, jobsToSchedule};
    };
    let created;
    try {created = await this.repos.transaction(create)}
    catch (error) {
      if ((error as Error).message !== 'DUPLICATE_ID') throw error;
      created = await this.repos.transaction(create);
    }
    for (const job of created.jobsToSchedule) await this.queue?.schedule(job.id, job.scheduledAt);
    return {batchId: created.batchId, results: created.results};
  }

  private tryPublisher(platform: Platform, strategy: 'API' | 'BROWSER') {
    try {return this.registry.get(platform, strategy)} catch {return undefined}
  }
  async tiktokCreatorInfo(accountId:string){
    const adapter=this.registry.get('TIKTOK','API') as {creatorInfo?:(accountId:string)=>Promise<Record<string,unknown>>;isAuditApproved?:()=>boolean};
    if(!adapter.creatorInfo)throw new Error('TIKTOK_NOT_CONFIGURED');
    return{...await adapter.creatorInfo(accountId),auditApproved:adapter.isAuditApproved?.()??false};
  }
  async youtubePlaylists(accountId:string){const adapter=this.registry.get('YOUTUBE','API') as unknown as {playlists:(id:string)=>Promise<Array<{id:string;title:string}>>};return adapter.playlists(accountId)}
  async youtubeCategories(regionCode:string,accountId:string){const adapter=this.registry.get('YOUTUBE','API') as unknown as {categories:(region:string,id:string)=>Promise<Array<{id:string;title:string}>>;isAudited:()=>boolean};return{categories:await adapter.categories(regionCode,accountId),audited:adapter.isAudited()}}
  private toInput(brandId: string, socialAccountId: string, variant: ContentVariant, contentType: ContentType) {
    return {brandId, socialAccountId, contentVariantId: variant.id, platform: variant.platform, contentType,
      ...(variant.caption ? {caption: variant.caption} : {}), ...(variant.body ? {body: variant.body} : {}),metadata:{...(variant.format?{format:variant.format}:{}),...(variant.tiktokSettings?{tiktok:variant.tiktokSettings}:{}),...(variant.youtube?{youtube:variant.youtube}:{})}};
  }
}
