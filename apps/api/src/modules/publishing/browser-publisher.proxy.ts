import type {Repositories} from '../../../../../packages/shared/src/repositories.ts';
import type {Platform} from '../../../../../packages/shared/src/domain.ts';
import type {PlatformPublisher, PublishInput, PublishResult, ValidationResult, PublishedPostData, PostMetricsData} from '../../../../../packages/platform-contracts/src/index.ts';
import {PublishError} from '../../../../../packages/platform-contracts/src/index.ts';
import type {BrowserGatewayClient} from '../browser-nodes/browser-gateway.client.ts';

const supported: Record<Platform, Set<string>> = {
  FACEBOOK: new Set(['TEXT', 'IMAGE', 'VIDEO']),
  INSTAGRAM: new Set(['IMAGE', 'VIDEO']),
  THREADS: new Set(['TEXT', 'IMAGE', 'VIDEO']),
  TIKTOK: new Set(['IMAGE', 'VIDEO']),
};

export class BrowserPublisherProxy implements PlatformPublisher {
  private readonly platform: Platform;
  private readonly repos: Repositories;
  private readonly client: BrowserGatewayClient;
  private readonly pollIntervalMs: number;
  private readonly timeoutMs: number;
  constructor(platform: Platform, repos: Repositories, client: BrowserGatewayClient, options: {pollIntervalMs?: number; timeoutMs?: number} = {}) {
    this.platform = platform; this.repos = repos; this.client = client;
    this.pollIntervalMs = options.pollIntervalMs ?? 500; this.timeoutMs = options.timeoutMs ?? 120_000;
  }

  async validate(input: PublishInput): Promise<ValidationResult> {
    const valid = input.platform === this.platform && supported[this.platform].has(input.contentType);
    return {valid, errors: valid ? [] : ['BROWSER_UNSUPPORTED'], warnings: []};
  }

  async publish(input: PublishInput): Promise<PublishResult> {
    const {node, profile} = await this.context(input.socialAccountId);
    const created = await this.client.createTask(node, {type: 'PUBLISH', profileId: profile.providerProfileId, platform: this.platform,
      payload: {...(input.mediaUrl ? {mediaUrl: input.mediaUrl} : {}), ...((input.body ?? input.caption) ? {text: input.body ?? input.caption} : {}), contentType: input.contentType},
      correlationId: input.remoteCorrelationId ?? input.socialAccountId + ':' + input.contentVariantId});
    const deadline = Date.now() + this.timeoutMs;
    while (Date.now() <= deadline) {
      const task = await this.client.getTask(node, created.taskId);
      if (task.state === 'DONE') {
        const externalPostId = String(task.result?.externalPostId ?? '');
        if (!externalPostId) throw new PublishError({type: 'BROWSER_ERROR', code: 'NO_POST_ID', message: 'Browser task completed without post id', retryable: true});
        return {externalPostId, ...(task.result?.externalUrl ? {externalUrl: String(task.result.externalUrl)} : {}),
          remoteCorrelationId: created.taskId, publishedAt: Date.now()};
      }
      if (task.state === 'FAILED') throw new PublishError({type: 'BROWSER_ERROR', code: task.error?.code ?? 'BROWSER_FAILED', message: task.error?.message ?? 'Browser publish failed', retryable: task.error?.retryable ?? true});
      await new Promise(resolve => setTimeout(resolve, this.pollIntervalMs));
    }
    throw new PublishError({type: 'BROWSER_ERROR', code: 'BROWSER_TIMEOUT', message: 'Browser publish timed out', retryable: true});
  }

  async fetchPost(taskId: string, context?: {socialAccountId?: string}): Promise<PublishedPostData> {
    if (!context?.socialAccountId) throw new Error('ACCOUNT_CONTEXT_REQUIRED');
    const {node} = await this.context(context.socialAccountId), task = await this.client.getTask(node, taskId);
    if (task.state === 'FAILED') throw new PublishError({type: 'BROWSER_ERROR', code: task.error?.retryable ? 'TASK_RETRYABLE_FAILURE' : task.error?.code ?? 'BROWSER_FAILED', message: task.error?.message ?? 'Browser publish failed', retryable: task.error?.retryable ?? false});
    const externalPostId = task.result?.externalPostId;
    return {externalPostId: String(externalPostId ?? taskId), ...(task.result?.externalUrl ? {externalUrl: String(task.result.externalUrl)} : {}),
      exists: task.state === 'DONE' && !!externalPostId};
  }

  async fetchMetrics(_postId: string, _context?: {socialAccountId?: string}): Promise<PostMetricsData> {
    return {raw: {source: 'browser', available: false}};
  }

  private async context(accountId: string) {
    const account = await this.repos.socialAccounts.get(accountId);
    if (!account?.browserProfileId) throw new Error('BROWSER_PROFILE_REQUIRED');
    const profile = await this.repos.browserProfiles.get(account.browserProfileId);
    if (!profile) throw new Error('BROWSER_PROFILE_REQUIRED');
    const node = await this.repos.browserNodes.get(profile.browserNodeId);
    if (!node || node.status !== 'ONLINE' || !node.lastSeenAt || Date.now() - node.lastSeenAt > 45_000)
      throw new PublishError({type: 'BROWSER_ERROR', code: 'NODE_OFFLINE', message: 'Browser node offline', retryable: true});
    return {node, profile};
  }
}
