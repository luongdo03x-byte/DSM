import type {Repositories} from '../../../../../packages/shared/src/repositories.ts';
import {id} from '../../../../../packages/shared/src/ids.ts';

export class CampaignsService {
  private readonly repos: Repositories;
  constructor(repos: Repositories) {this.repos = repos}

  async create(brandId: string, input: {name: string; productId?: string; description?: string}) {
    if (input.productId) {
      const product = await this.repos.products.get(input.productId);
      if (!product || product.brandId !== brandId) throw new Error('PRODUCT_NOT_FOUND');
    }
    return this.repos.campaigns.insert({id: id('cmp'), brandId, name: input.name, status: 'DRAFT', contentIds: [],
      ...(input.productId !== undefined ? {productId: input.productId} : {}),
      ...(input.description !== undefined ? {description: input.description} : {})});
  }

  async attachContent(brandId: string, campaignId: string, contentId: string) {
    const campaign = await this.repos.campaigns.get(campaignId), content = await this.repos.contents.get(contentId);
    if (!campaign || campaign.brandId !== brandId) throw new Error('CAMPAIGN_NOT_FOUND');
    if (!content || content.brandId !== brandId) throw new Error('CONTENT_NOT_FOUND');
    if (campaign.contentIds.includes(contentId)) return campaign;
    return this.repos.campaigns.update(campaignId, {contentIds: [...campaign.contentIds, contentId]});
  }
}
