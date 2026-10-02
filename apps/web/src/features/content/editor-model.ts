import type {ContentItem,ContentVariant,Platform} from '../../../../../packages/shared/src/domain.ts';
export class ContentEditorModel{
  private master:ContentItem; private variants=new Map<Platform,ContentVariant>();
  constructor(master:ContentItem){this.master=master}
  copyMasterToPlatforms(items:ContentVariant[]){for(const item of items)this.variants.set(item.platform,{...item,hashtags:[...item.hashtags]})}
  platforms(){return [...this.variants.keys()]}
  variant(platform:Platform){return this.variants.get(platform)}
  updateVariant(platform:Platform,patch:Partial<Pick<ContentVariant,'caption'|'body'|'hashtags'|'cta'|'assetId'|'status'>>){const current=this.variants.get(platform);if(!current)throw new Error('VARIANT_NOT_FOUND');this.variants.set(platform,{...current,...patch,...(patch.hashtags?{hashtags:[...patch.hashtags]}:{})})}
  snapshot(){return{master:this.master,variants:[...this.variants.values()]}}
}
