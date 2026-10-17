import type {Repositories} from '../../../../../packages/shared/src/repositories.ts';
import {id} from '../../../../../packages/shared/src/ids.ts';
import {trackingCode} from './tracking-code.ts';

type LinkInput = {targetUrl: string; productId?: string; contentItemId?: string; utmSource?: string; utmMedium?: string; utmCampaign?: string; utmContent?: string};
type ClickMeta = {referrer?: string; userAgent?: string; country?: string; deviceType?: string};

export class TrackingService {
  private readonly repos: Repositories;
  constructor(repos: Repositories) {this.repos = repos}

  async create(brandId: string, input: LinkInput) {
    const target = new URL(input.targetUrl);
    if (!['http:', 'https:'].includes(target.protocol)) throw new Error('INVALID_TARGET_URL');
    let code = trackingCode();
    while ((await this.repos.trackedLinks.findBy({code})).length) code = trackingCode();
    const link = await this.repos.trackedLinks.insert({id: id('link'), brandId, code, targetUrl: target.toString(),
      ...(input.productId ? {productId: input.productId} : {}), ...(input.contentItemId ? {contentItemId: input.contentItemId} : {}),
      ...(input.utmSource ? {utmSource: input.utmSource} : {}), ...(input.utmMedium ? {utmMedium: input.utmMedium} : {}),
      ...(input.utmCampaign ? {utmCampaign: input.utmCampaign} : {}), ...(input.utmContent ? {utmContent: input.utmContent} : {})});
    return {id: link.id, code, url: '/r/' + code};
  }

  async resolve(code: string, meta: ClickMeta): Promise<string> {
    const link = (await this.repos.trackedLinks.findBy({code}))[0];
    if (!link) throw new Error('LINK_NOT_FOUND');
    await this.repos.clickEvents.append({id: id('click'), trackedLinkId: link.id, timestamp: Date.now(),
      ...(meta.referrer ? {referrer: meta.referrer} : {}), ...(meta.userAgent ? {userAgent: meta.userAgent} : {}),
      ...(meta.country ? {country: meta.country} : {}), ...(meta.deviceType ? {deviceType: meta.deviceType} : {})});
    return link.targetUrl;
  }

  async bindToPublishedPost(brandId: string, linkId: string, postId: string): Promise<void> {
    const link = await this.repos.trackedLinks.get(linkId), post = await this.repos.publishedPosts.get(postId);
    if (!link || link.brandId !== brandId || !post || post.brandId !== brandId) throw new Error('BINDING_NOT_FOUND');
    await this.repos.trackedLinks.update(linkId, {publishedPostId: postId});
  }
}
