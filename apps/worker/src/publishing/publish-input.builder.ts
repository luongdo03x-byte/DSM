import type {MemoryStore} from '../../../../packages/shared/src/store.ts';
import type {PublishJob} from '../../../../packages/shared/src/domain.ts';
import type {PublishInput} from '../../../../packages/platform-contracts/src/index.ts';
import type {MediaService} from '../../../api/src/modules/media/media.service.ts';

export class PublishInputBuilder{
  private store:MemoryStore;private media:MediaService;
  constructor(store:MemoryStore,media:MediaService){this.store=store;this.media=media}
  async build(job:Pick<PublishJob,'brandId'|'socialAccountId'|'contentVariantId'|'platform'|'remoteCorrelationId'>):Promise<PublishInput>{
    const variant=this.store.variants.get(job.contentVariantId);if(!variant)throw new Error('VARIANT_NOT_FOUND');const content=this.store.contents.get(variant.contentItemId);if(!content||content.brandId!==job.brandId)throw new Error('CONTENT_NOT_FOUND');const brand=this.store.brands.get(job.brandId);if(!brand)throw new Error('BRAND_NOT_FOUND');
    const assetId=variant.assetId??content.masterAssetId;let mediaUrl:string|undefined;if(assetId)mediaUrl=await this.media.download({workspaceId:brand.workspaceId,brandId:job.brandId},assetId);
    return{brandId:job.brandId,socialAccountId:job.socialAccountId,contentVariantId:variant.id,platform:job.platform,contentType:content.type,...(variant.caption?{caption:variant.caption}:{}),...(variant.body?{body:variant.body}:{}),...(mediaUrl?{mediaUrl}:{}),...(job.remoteCorrelationId?{remoteCorrelationId:job.remoteCorrelationId}:{})};
  }
}
