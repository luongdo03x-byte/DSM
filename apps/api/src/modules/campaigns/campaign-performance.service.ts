import type {Repositories} from '../../../../../packages/shared/src/repositories.ts';
import {AnalyticsService, ctr} from '../analytics/analytics.service.ts';

export class CampaignPerformanceService {
  private readonly repos: Repositories;
  private readonly analytics: AnalyticsService;
  constructor(repos: Repositories, analytics: AnalyticsService) {this.repos = repos; this.analytics = analytics}

  async get(brandId: string, campaignId: string) {
    const campaign = await this.repos.campaigns.get(campaignId);
    if (!campaign || campaign.brandId !== brandId) throw new Error('CAMPAIGN_NOT_FOUND');
    const contentSet = new Set(campaign.contentIds);
    const rows = [];
    for (const row of await this.analytics.content(brandId)) {
      const variant = await this.repos.variants.get(row.contentVariantId);
      if (variant && contentSet.has(variant.contentItemId)) rows.push(row);
    }
    rows.sort((a, b) => b.views - a.views);
    const views = rows.reduce((count, row) => count + row.views, 0), clicks = rows.reduce((count, row) => count + row.clicks, 0);
    return {views, clicks, ctr: ctr(clicks, views), posts: rows.length, content: rows};
  }
}
