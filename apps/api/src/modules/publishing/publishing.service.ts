import type {ContentType, ContentVariant, Platform, PublishJob} from '../../../../../packages/shared/src/domain.ts';
import type {Repositories} from '../../../../../packages/shared/src/repositories.ts';
import type {JobQueue} from '../../../../../packages/shared/src/job-queue.ts';
import {id} from '../../../../../packages/shared/src/ids.ts';
import {sha256} from '../../../../../packages/shared/src/security.ts';
import {PublisherRegistry} from './publisher-registry.ts';
import {StrategyResolver} from './strategy-resolver.ts';

type ValidationInput = {brandId: string; contentId: string; socialAccountIds: string[]; apiHealth?: Record<string, boolean>; browserHealth?: Record<string, boolean>};

export class PublishingService {
  private readonly repos: Repositories;
  private readonly registry: PublisherRegistry;
  private readonly resolver: StrategyResolver;
  private readonly queue: JobQueue | undefined;
  constructor(repos: Repositories, registry: PublisherRegistry, resolver: StrategyResolver, queue?: JobQueue) {
    this.repos = repos; this.registry = registry; this.resolver = resolver; this.queue = queue;
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
      if (!variant || variant.status !== 'READY') {
        results.push({socialAccountId: accountId, platform: account.platform, valid: false, errors: ['VARIANT_NOT_READY'], warnings: []});
        continue;
      }
      const api = this.tryPublisher(account.platform, 'API'), browser = this.tryPublisher(account.platform, 'BROWSER'), contentType = content.type as ContentType;
      const apiResult = api ? await api.validate(this.toInput(input.brandId, account.id, variant, contentType)) : undefined;
      const browserResult = browser ? await browser.validate(this.toInput(input.brandId, account.id, variant, contentType)) : undefined;
      if (account.publishMode === 'API' && apiResult && !apiResult.valid) {
        results.push({socialAccountId: accountId, platform: account.platform, valid: false, errors: apiResult.errors, warnings: apiResult.warnings});
        continue;
      }
      if (account.publishMode === 'BROWSER' && browserResult && !browserResult.valid) {
        results.push({socialAccountId: accountId, platform: account.platform, valid: false, errors: browserResult.errors, warnings: browserResult.warnings});
        continue;
      }
      if (account.publishMode === 'HYBRID' && apiResult && !apiResult.valid && browserResult && !browserResult.valid) {
        results.push({socialAccountId: accountId, platform: account.platform, valid: false, errors: [...new Set([...apiResult.errors, ...browserResult.errors])], warnings: [...new Set([...apiResult.warnings, ...browserResult.warnings])]});
        continue;
      }
      if (account.publishMode === 'HYBRID' && apiResult && !apiResult.valid && !browserResult) {
        results.push({socialAccountId: accountId, platform: account.platform, valid: false, errors: apiResult.errors, warnings: apiResult.warnings});
        continue;
      }
      if (account.publishMode === 'HYBRID' && browserResult && !browserResult.valid && !apiResult) {
        results.push({socialAccountId: accountId, platform: account.platform, valid: false, errors: browserResult.errors, warnings: browserResult.warnings});
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
        results.push({socialAccountId: accountId, platform: account.platform, valid: false, errors: [error.code ?? String(error.message ?? 'VALIDATION')], warnings: []});
        continue;
      }
      const selected = strategy === 'API' ? apiResult : browserResult;
      results.push({socialAccountId: accountId, platform: account.platform, valid: true, errors: [], warnings: selected?.warnings ?? [], strategy, contentVariantId: variant.id});
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
        const job: PublishJob = existing ?? {id: id('job'), batchId, brandId: input.brandId, socialAccountId: result.socialAccountId,
          contentVariantId: result.contentVariantId, platform: result.platform, strategy: result.strategy, scheduledAt,
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
  private toInput(brandId: string, socialAccountId: string, variant: ContentVariant, contentType: ContentType) {
    return {brandId, socialAccountId, contentVariantId: variant.id, platform: variant.platform, contentType,
      ...(variant.caption ? {caption: variant.caption} : {}), ...(variant.body ? {body: variant.body} : {})};
  }
}
