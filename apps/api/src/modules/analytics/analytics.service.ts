import type {PostMetric} from '../../../../../packages/shared/src/domain.ts';
import type {Repositories} from '../../../../../packages/shared/src/repositories.ts';

export function ctr(clicks: number, views: number | undefined) {return views && views > 0 ? clicks / views * 100 : null}

function latest(metrics: PostMetric[], postId: string, from: number, to: number) {
  return metrics.filter(row => row.publishedPostId === postId && row.capturedAt >= from && row.capturedAt <= to)
    .sort((a, b) => b.capturedAt - a.capturedAt)[0];
}

export class AnalyticsService {
  private readonly repos: Repositories;
  constructor(repos: Repositories) {this.repos = repos}

  async overview(brandId: string, from = 0, to = Infinity) {
    const posts = (await this.repos.publishedPosts.findBy({brandId})).filter(post => post.publishedAt >= from && post.publishedAt <= to);
    const metrics = await this.repos.postMetrics.findBy({}), links = await this.repos.trackedLinks.findBy({brandId}), events = await this.repos.clickEvents.findBy({});
    let views = 0;
    const platforms = new Map<string, {platform: string; posts: number; views: number; clicks: number}>();
    for (const post of posts) {
      const metric = latest(metrics, post.id, from, to), postViews = metric?.views ?? 0;
      const postLinks = links.filter(link => link.publishedPostId === post.id);
      const clicks = postLinks.reduce((count, link) => count + events.filter(event => event.trackedLinkId === link.id && event.timestamp >= from && event.timestamp <= to).length, 0);
      views += postViews;
      const row = platforms.get(post.platform) ?? {platform: post.platform, posts: 0, views: 0, clicks: 0};
      row.posts++; row.views += postViews; row.clicks += clicks;
      platforms.set(post.platform, row);
    }
    const clicks = [...platforms.values()].reduce((count, row) => count + row.clicks, 0);
    return {posts: posts.length, views, clicks, ctr: ctr(clicks, views), platforms: [...platforms.values()].map(row => ({...row, ctr: ctr(row.clicks, row.views)}))};
  }

  async content(brandId: string) {
    const posts = await this.repos.publishedPosts.findBy({brandId});
    const metrics = await this.repos.postMetrics.findBy({}), links = await this.repos.trackedLinks.findBy({brandId}), events = await this.repos.clickEvents.findBy({});
    return posts.map(post => {
      const metric = latest(metrics, post.id, 0, Infinity);
      const postLinks = links.filter(link => link.publishedPostId === post.id);
      const clicks = postLinks.reduce((count, link) => count + events.filter(event => event.trackedLinkId === link.id).length, 0);
      const views = metric?.views ?? 0;
      return {publishedPostId: post.id, contentVariantId: post.contentVariantId, platform: post.platform, views, clicks, ctr: ctr(clicks, views)};
    });
  }

  async platforms(brandId: string) {return (await this.overview(brandId)).platforms}
}
