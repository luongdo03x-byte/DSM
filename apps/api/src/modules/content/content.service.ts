import {id} from '../../../../../packages/shared/src/ids.ts';
import type {ContentItem, ContentType, ContentVariant, Platform} from '../../../../../packages/shared/src/domain.ts';
import type {Repositories} from '../../../../../packages/shared/src/repositories.ts';
import type {AuditService} from '../audit/audit.service.ts';

const platforms: Platform[] = ['FACEBOOK', 'INSTAGRAM', 'THREADS', 'TIKTOK'];
type CreateContent = {type: ContentType; title: string; productId?: string; hook?: string; body?: string; cta?: string; masterAssetId?: string};
type UpdateVariant = {caption?: string; body?: string; hashtags?: string[]; cta?: string; assetId?: string; status?: 'DRAFT' | 'READY'};

export class ContentService {
  private readonly repos: Repositories;
  private readonly audit: AuditService | undefined;
  constructor(repos: Repositories, audit?: AuditService) {this.repos = repos; this.audit = audit}

  async create(brandId: string, input: CreateContent, userId?: string): Promise<ContentItem> {
    if (input.type === 'TEXT' && input.masterAssetId) throw new Error('TEXT_MEDIA_INVALID');
    if (input.productId) {
      const product = await this.repos.products.get(input.productId);
      if (!product || product.brandId !== brandId) throw new Error('PRODUCT_NOT_FOUND');
    }
    if (input.masterAssetId) {
      const asset = await this.repos.media.get(input.masterAssetId);
      if (!asset || asset.brandId !== brandId) throw new Error('MEDIA_NOT_FOUND');
    }
    const content: ContentItem = {...input, id: id('cnt'), brandId, status: 'DRAFT'};
    if (!this.audit) return this.repos.contents.insert(content);
    const workspaceId = await this.audit.workspaceForBrand(brandId);
    return this.repos.transaction(async tx => {
      const created = await tx.contents.insert(content);
      await this.audit!.record({workspaceId, ...(userId ? {userId} : {}), action: 'CONTENT_CREATE', entityType: 'CONTENT', entityId: content.id}, tx);
      return created;
    });
  }

  async copyMasterToAll(brandId: string, contentId: string): Promise<ContentVariant[]> {
    const content = await this.repos.contents.get(contentId);
    if (!content || content.brandId !== brandId) throw new Error('CONTENT_NOT_FOUND');
    const existing = await this.repos.variants.findBy({contentItemId: contentId});
    const output: ContentVariant[] = [];
    for (const platform of platforms) {
      let variant = existing.find(row => row.platform === platform && !row.socialAccountId);
      if (!variant) {
        variant = await this.repos.variants.insert({
          id: id('var'), contentItemId: contentId, platform, hashtags: [], status: 'DRAFT',
          ...(content.body !== undefined ? {caption: content.body, body: content.body} : {}),
          ...(content.cta !== undefined ? {cta: content.cta} : {}),
          ...(content.masterAssetId !== undefined ? {assetId: content.masterAssetId} : {}),
        });
      }
      output.push(variant);
    }
    return output;
  }

  async updateVariant(brandId: string, variantId: string, input: UpdateVariant): Promise<ContentVariant> {
    const variant = await this.repos.variants.get(variantId);
    if (!variant) throw new Error('VARIANT_NOT_FOUND');
    const content = await this.repos.contents.get(variant.contentItemId);
    if (!content || content.brandId !== brandId) throw new Error('VARIANT_NOT_FOUND');
    if (input.assetId) {
      const asset = await this.repos.media.get(input.assetId);
      if (!asset || asset.brandId !== brandId) throw new Error('MEDIA_NOT_FOUND');
    }
    return this.repos.variants.update(variantId, input);
  }

  async listVariants(brandId: string, contentId: string): Promise<ContentVariant[]> {
    const content = await this.repos.contents.get(contentId);
    if (!content || content.brandId !== brandId) throw new Error('CONTENT_NOT_FOUND');
    return this.repos.variants.findBy({contentItemId: contentId});
  }
}
