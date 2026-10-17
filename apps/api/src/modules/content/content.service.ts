import {id} from '../../../../../packages/shared/src/ids.ts';
import type {ContentItem, ContentMedia, ContentType, ContentVariant, CropBox, Platform, VariantMedia} from '../../../../../packages/shared/src/domain.ts';
import type {Repositories} from '../../../../../packages/shared/src/repositories.ts';
import {inferFormat, preflight, type PreflightIssue} from '../../../../../packages/shared/src/preflight.ts';
import type {MediaFacts} from '../../../../../packages/shared/src/media-rules.ts';
import type {AuditService} from '../audit/audit.service.ts';

const platforms: Platform[] = ['FACEBOOK', 'INSTAGRAM', 'THREADS', 'TIKTOK', 'YOUTUBE'];
type CreateContent = {type: ContentType; title: string; productId?: string; hook?: string; body?: string; cta?: string; masterAssetId?: string; mediaAssetIds?: string[]};
type UpdateVariant = {caption?: string; body?: string; hashtags?: string[]; cta?: string; assetId?: string; status?: 'DRAFT' | 'READY'};

export class ContentService {
  private readonly repos: Repositories;
  private readonly audit: AuditService | undefined;
  constructor(repos: Repositories, audit?: AuditService) {this.repos = repos; this.audit = audit}

  async create(brandId: string, input: CreateContent, userId?: string): Promise<ContentItem> {
    const mediaAssetIds = input.mediaAssetIds ?? (input.masterAssetId ? [input.masterAssetId] : []);
    if (input.type === 'TEXT' && mediaAssetIds.length) throw new Error('TEXT_MEDIA_INVALID');
    if (input.type === 'ALBUM' && mediaAssetIds.length < 2) throw new Error('ALBUM_MEDIA_REQUIRED');
    await this.validateMedia(brandId, mediaAssetIds);
    if (input.productId) {
      const product = await this.repos.products.get(input.productId);
      if (!product || product.brandId !== brandId) throw new Error('PRODUCT_NOT_FOUND');
    }
    const {mediaAssetIds: _unused, masterAssetId: _legacy, ...fields} = input;
    const content: ContentItem = {...fields, id: id('cnt'), brandId, status: 'DRAFT',
      ...(mediaAssetIds.length === 1 ? {masterAssetId: mediaAssetIds[0]!} : {})};
    const workspaceId = this.audit ? await this.audit.workspaceForBrand(brandId) : undefined;
    return this.repos.transaction(async tx => {
      const created = await tx.contents.insert(content);
      for (const [position, mediaAssetId] of mediaAssetIds.entries()) await tx.contentMedia.insert({id:id('cm'),contentItemId:content.id,mediaAssetId,position});
      if (this.audit && workspaceId) await this.audit.record({workspaceId, ...(userId ? {userId} : {}), action: 'CONTENT_CREATE', entityType: 'CONTENT', entityId: content.id}, tx);
      return created;
    });
  }

  async setMedia(brandId:string, contentId:string, mediaAssetIds:string[]):Promise<ContentMedia[]> {
    const content = await this.contentForBrand(brandId,contentId);
    if (content.type === 'TEXT' && mediaAssetIds.length) throw new Error('TEXT_MEDIA_INVALID');
    if (content.type === 'ALBUM' && mediaAssetIds.length < 2) throw new Error('ALBUM_MEDIA_REQUIRED');
    if (content.type !== 'TEXT' && !mediaAssetIds.length) throw new Error('MEDIA_REQUIRED');
    await this.validateMedia(brandId,mediaAssetIds);
    return this.repos.transaction(async tx => {
      for (const row of await tx.contentMedia.findBy({contentItemId:contentId})) await tx.contentMedia.remove(row.id);
      const rows:ContentMedia[] = [];
      for (const [position,mediaAssetId] of mediaAssetIds.entries()) rows.push(await tx.contentMedia.insert({id:id('cm'),contentItemId:contentId,mediaAssetId,position}));
      if(mediaAssetIds.length===1) await tx.contents.update(contentId,{masterAssetId:mediaAssetIds[0]!});
      return rows;
    });
  }

  async copyMasterToAll(brandId: string, contentId: string): Promise<ContentVariant[]> {
    const content = await this.contentForBrand(brandId,contentId);
    const source = await this.masterMedia(content);
    const media = await this.mediaFacts(source.map(row=>row.mediaAssetId));
    const existing = await this.repos.variants.findBy({contentItemId: contentId});
    const output: ContentVariant[] = [];
    for (const platform of platforms) {
      let variant = existing.find(row => row.platform === platform && !row.socialAccountId);
      if (!variant) {
        const inferred = inferFormat(platform,content.type,media);
        variant = await this.repos.variants.insert({
          id: id('var'), contentItemId: contentId, platform, hashtags: [], status: 'DRAFT',
          title: content.title,
          ...('format' in inferred ? {format:inferred.format} : {skippedReason:inferred.skipped}),
          ...(content.body !== undefined ? {caption: content.body, body: content.body} : {}),
          ...(content.cta !== undefined ? {cta: content.cta} : {}),
          ...(source.length===1 ? {assetId:source[0]!.mediaAssetId} : {}),
        });
        if (!variant.skippedReason) for (const row of source) await this.repos.variantMedia.insert({id:id('vm'),contentVariantId:variant.id,mediaAssetId:row.mediaAssetId,position:row.position,isCover:row.position===0});
      }
      output.push(variant);
    }
    return output;
  }

  async setVariantMedia(brandId:string, variantId:string, items:Array<{mediaAssetId:string;crop?:CropBox;isCover?:boolean}>):Promise<VariantMedia[]> {
    await this.variantForBrand(brandId,variantId);
    await this.validateMedia(brandId,items.map(item=>item.mediaAssetId));
    if (items.filter(item=>item.isCover).length>1) throw new Error('MULTIPLE_COVERS');
    for (const item of items) if (item.crop) {
      const {x,y,width,height}=item.crop;
      if (![x,y,width,height].every(Number.isFinite)||x<0||y<0||width<=0||height<=0||x+width>100||y+height>100) throw new Error('CROP_INVALID');
    }
    return this.repos.transaction(async tx => {
      for (const row of await tx.variantMedia.findBy({contentVariantId:variantId})) await tx.variantMedia.remove(row.id);
      const rows:VariantMedia[]=[];
      for (const [position,item] of items.entries()) rows.push(await tx.variantMedia.insert({id:id('vm'),contentVariantId:variantId,mediaAssetId:item.mediaAssetId,position,isCover:item.isCover??position===0,...(item.crop?{crop:item.crop}:{})}));
      if(items.length===1) await tx.variants.update(variantId,{assetId:items[0]!.mediaAssetId});
      return rows;
    });
  }

  async preflightVariant(brandId:string,variantId:string):Promise<PreflightIssue[]> {
    const {variant,content}=await this.variantForBrand(brandId,variantId);
    if (variant.skippedReason) return [{code:'VARIANT_SKIPPED',severity:'error',message:variant.skippedReason,field:'media'}];
    const rows=await this.variantMedia(variant);
    const media=await this.mediaFacts(rows.map(row=>row.mediaAssetId));
    const format=variant.format??inferFormat(variant.platform,content.type,media);
    if (typeof format==='object' && 'skipped' in format) return [{code:'VARIANT_SKIPPED',severity:'error',message:format.skipped,field:'media'}];
    return preflight({platform:variant.platform,format:typeof format==='string'?format:format.format,hashtags:variant.hashtags,media,
      ...(variant.caption?{caption:variant.caption}:{}),...(variant.title?{title:variant.title}:{})});
  }

  private async contentForBrand(brandId:string,contentId:string):Promise<ContentItem> {
    const content=await this.repos.contents.get(contentId);
    if (!content||content.brandId!==brandId) throw new Error('CONTENT_NOT_FOUND');
    return content;
  }
  private async variantForBrand(brandId:string,variantId:string) {
    const variant=await this.repos.variants.get(variantId);
    if (!variant) throw new Error('VARIANT_NOT_FOUND');
    const content=await this.contentForBrand(brandId,variant.contentItemId);
    return {variant,content};
  }
  private async validateMedia(brandId:string,ids:string[]):Promise<void> {
    if (new Set(ids).size!==ids.length) throw new Error('MEDIA_DUPLICATE');
    for (const assetId of ids) {const asset=await this.repos.media.get(assetId);if(!asset||asset.brandId!==brandId)throw new Error('MEDIA_NOT_FOUND');}
  }
  private async masterMedia(content:ContentItem):Promise<ContentMedia[]> {
    const rows=await this.repos.contentMedia.findBy({contentItemId:content.id});
    return rows.length?rows:content.masterAssetId?[{id:'legacy',contentItemId:content.id,mediaAssetId:content.masterAssetId,position:0}]:[];
  }
  private async variantMedia(variant:ContentVariant):Promise<VariantMedia[]> {
    const rows=await this.repos.variantMedia.findBy({contentVariantId:variant.id});
    return rows.length?rows:variant.assetId?[{id:'legacy',contentVariantId:variant.id,mediaAssetId:variant.assetId,position:0,isCover:true}]:[];
  }
  private async mediaFacts(ids:string[]):Promise<MediaFacts[]> {
    const facts:MediaFacts[]=[];
    for(const assetId of ids){const asset=await this.repos.media.get(assetId);if(!asset)throw new Error('MEDIA_NOT_FOUND');facts.push({kind:asset.type,mimeType:asset.mimeType,width:asset.width??0,height:asset.height??0,sizeBytes:asset.sizeBytes??0,...(asset.durationMs!==undefined?{durationMs:asset.durationMs}:{})});}
    return facts;
  }

  async updateVariant(brandId: string, variantId: string, input: UpdateVariant): Promise<ContentVariant> {
    const variant = await this.repos.variants.get(variantId);
    if (!variant) throw new Error('VARIANT_NOT_FOUND');
    const content = await this.repos.contents.get(variant.contentItemId);
    if (!content || content.brandId !== brandId) throw new Error('VARIANT_NOT_FOUND');
    if (input.status === 'READY' && variant.skippedReason) throw new Error('VARIANT_SKIPPED');
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
