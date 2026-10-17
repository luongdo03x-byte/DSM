import type {PublishJob} from '../../../../packages/shared/src/domain.ts';
import type {Repositories} from '../../../../packages/shared/src/repositories.ts';
import type {PublishInput} from '../../../../packages/platform-contracts/src/index.ts';
import type {MediaService} from '../../../api/src/modules/media/media.service.ts';

export class PublishInputBuilder {
  private readonly repos: Repositories;
  private readonly media: MediaService;
  constructor(repos: Repositories, media: MediaService) {this.repos = repos; this.media = media}

  async build(job: Pick<PublishJob, 'brandId' | 'socialAccountId' | 'contentVariantId' | 'platform' | 'remoteCorrelationId'>): Promise<PublishInput> {
    const variant = await this.repos.variants.get(job.contentVariantId);
    if (!variant) throw new Error('VARIANT_NOT_FOUND');
    const content = await this.repos.contents.get(variant.contentItemId);
    if (!content || content.brandId !== job.brandId) throw new Error('CONTENT_NOT_FOUND');
    const brand = await this.repos.brands.get(job.brandId);
    if (!brand) throw new Error('BRAND_NOT_FOUND');
    const assetId = variant.assetId ?? content.masterAssetId;
    const mediaUrl = assetId ? await this.media.download({workspaceId: brand.workspaceId, brandId: job.brandId}, assetId) : undefined;
    return {brandId: job.brandId, socialAccountId: job.socialAccountId, contentVariantId: variant.id, platform: job.platform, contentType: content.type,
      ...(variant.caption ? {caption: variant.caption} : {}), ...(variant.body ? {body: variant.body} : {}),
      ...(mediaUrl ? {mediaUrl} : {}), ...(job.remoteCorrelationId ? {remoteCorrelationId: job.remoteCorrelationId} : {})};
  }
}
