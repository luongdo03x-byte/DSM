import type {PublishJob} from '../../../../packages/shared/src/domain.ts';
import type {Repositories} from '../../../../packages/shared/src/repositories.ts';
import type {PublishInput} from '../../../../packages/platform-contracts/src/index.ts';
import type {MediaService} from '../../../api/src/modules/media/media.service.ts';
import {prepareVariantMedia} from '../media/media-jobs.ts';
import {MEDIA_RULES} from '../../../../packages/shared/src/media-rules.ts';

export class PublishInputBuilder {
  private readonly repos: Repositories;
  private readonly media: MediaService;
  private readonly publicMediaBaseUrl: string | undefined;
  constructor(repos: Repositories, media: MediaService, options: {publicMediaBaseUrl?:string}={}) {this.repos = repos; this.media = media; this.publicMediaBaseUrl=options.publicMediaBaseUrl??process.env.PUBLIC_MEDIA_BASE_URL}

  async build(job: Pick<PublishJob, 'brandId' | 'socialAccountId' | 'contentVariantId' | 'platform' | 'remoteCorrelationId' | 'publishAt'>): Promise<PublishInput> {
    const variant = await this.repos.variants.get(job.contentVariantId);
    if (!variant) throw new Error('VARIANT_NOT_FOUND');
    const content = await this.repos.contents.get(variant.contentItemId);
    if (!content || content.brandId !== job.brandId) throw new Error('CONTENT_NOT_FOUND');
    const brand = await this.repos.brands.get(job.brandId);
    if (!brand) throw new Error('BRAND_NOT_FOUND');
    const account=await this.repos.socialAccounts.get(job.socialAccountId);
    const product=content.productId?await this.repos.products.get(content.productId):undefined;
    const thumbnail=job.platform==='YOUTUBE'&&variant.youtube?.thumbnailAssetId?await this.repos.media.get(variant.youtube.thumbnailAssetId):undefined;
    if(thumbnail&&(thumbnail.brandId!==job.brandId||thumbnail.type!=='IMAGE'))throw new Error('YT_THUMBNAIL_INVALID');
    const assets=await prepareVariantMedia(this.repos,this.media.storage,variant.id,MEDIA_RULES[job.platform]);
    const mediaRows=(await this.repos.variantMedia.findBy({contentVariantId:variant.id})).sort((a,b)=>a.position-b.position);
    const media=[];
    for(const [index,asset] of assets.entries()){
      const url=this.publicMediaBaseUrl?`${this.publicMediaBaseUrl.replace(/\/$/,'')}/${asset.storageKey.split('/').map(encodeURIComponent).join('/')}`:await this.media.download({workspaceId:brand.workspaceId,brandId:job.brandId},asset.id);
      media.push({url,mimeType:asset.mimeType,kind:asset.type,width:asset.width??0,height:asset.height??0,isCover:mediaRows[index]?.isCover??index===0,storageKey:asset.storageKey,...(asset.sizeBytes!==undefined?{sizeBytes:asset.sizeBytes}:{}),...(asset.durationMs!==undefined?{durationMs:asset.durationMs}:{})});
    }
    const mediaUrl=media[0]?.url;
    return {brandId: job.brandId, socialAccountId: job.socialAccountId, contentVariantId: variant.id, platform: job.platform, contentType: content.type,
      ...(variant.caption ? {caption: variant.caption} : {}), ...(variant.body ? {body: variant.body} : {}),
      ...(mediaUrl ? {mediaUrl} : {}),...(media.length?{media}:{}), ...(job.remoteCorrelationId ? {remoteCorrelationId: job.remoteCorrelationId} : {}),
      metadata:{...(variant.format?{format:variant.format}:{}),...(variant.tiktokSettings&&job.platform==='TIKTOK'?{tiktok:variant.tiktokSettings}:{}),...(variant.youtube&&job.platform==='YOUTUBE'?{youtube:variant.youtube}:{}),...(thumbnail?{thumbnailStorageKey:thumbnail.storageKey,thumbnailMimeType:thumbnail.mimeType}:{}),...(job.publishAt&&job.platform==='YOUTUBE'?{publishAt:job.publishAt}:{}),...(account?.platformAccountId&&job.platform==='FACEBOOK'?{pageId:account.platformAccountId}:{}),...(account?.platformAccountId&&job.platform==='INSTAGRAM'?{platformAccountId:account.platformAccountId}:{}),...(product?.landingUrl?{link:product.landingUrl}:{})}};
  }
}
