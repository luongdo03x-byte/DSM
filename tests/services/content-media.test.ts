import assert from 'node:assert/strict';
import {test} from 'node:test';
import {ContentService} from '../../apps/api/src/modules/content/content.service.ts';
import {PublishingService} from '../../apps/api/src/modules/publishing/publishing.service.ts';
import {PublisherRegistry} from '../../apps/api/src/modules/publishing/publisher-registry.ts';
import {StrategyResolver} from '../../apps/api/src/modules/publishing/strategy-resolver.ts';
import {FakePublisher} from '../../apps/worker/src/testing/fake-publisher.ts';
import {MemoryRepositories} from '../../packages/shared/src/memory-repositories.ts';
import {MemoryStore} from '../../packages/shared/src/store.ts';

async function setup(count = 3) {
  const repos = new MemoryRepositories(new MemoryStore());
  await repos.workspaces.insert({id:'w',name:'W'});
  await repos.brands.insert({id:'b',workspaceId:'w',name:'B',slug:'b',language:'vi',timezone:'UTC',currency:'USD',status:'ACTIVE'});
  const assets = Array.from({length:count},(_,i)=>`m${i}`);
  for (const asset of assets) await repos.media.insert({id:asset,workspaceId:'w',brandId:'b',type:'IMAGE',mimeType:'image/jpeg',storageKey:`raw/${asset}`,width:1080,height:1350,sizeBytes:100_000});
  const content = new ContentService(repos);
  const item = await content.create('b',{type:'ALBUM',title:'Album',mediaAssetIds:assets});
  return {repos,content,item,assets};
}

test('album giữ thứ tự media và tạo variant theo nền tảng', async () => {
  const {repos,content,item,assets} = await setup();
  const rows = await repos.contentMedia.findBy({contentItemId:item.id});
  assert.deepEqual(rows.map(row=>row.mediaAssetId),assets);
  const variants = await content.copyMasterToAll('b',item.id);
  assert.equal(variants.find(v=>v.platform==='YOUTUBE')?.skippedReason,'YT_NO_IMAGE_API');
  assert.equal(variants.find(v=>v.platform==='YOUTUBE')?.status,'DRAFT');
  for (const platform of ['FACEBOOK','INSTAGRAM','TIKTOK'] as const) {
    const variant = variants.find(v=>v.platform===platform);
    assert.equal(variant?.format,'ALBUM');
    assert.deepEqual((await repos.variantMedia.findBy({contentVariantId:variant!.id})).map(row=>row.mediaAssetId),assets);
  }
  await content.setMedia('b',item.id,[assets[2]!,assets[0]!]);
  assert.deepEqual((await repos.contentMedia.findBy({contentItemId:item.id})).map(row=>row.mediaAssetId),[assets[2],assets[0]]);
});

test('preflight chặn Instagram album 11 ảnh khi validate', async () => {
  const {repos,content,item} = await setup(11);
  const variant = (await content.copyMasterToAll('b',item.id)).find(v=>v.platform==='INSTAGRAM')!;
  await content.updateVariant('b',variant.id,{status:'READY'});
  await repos.socialAccounts.insert({id:'ig',brandId:'b',platform:'INSTAGRAM',publishMode:'API',status:'CONNECTED'});
  const registry = new PublisherRegistry(); registry.register('INSTAGRAM','API',new FakePublisher());
  const publishing = new PublishingService(repos,registry,new StrategyResolver());
  const [result] = await publishing.validateTargets({brandId:'b',contentId:item.id,socialAccountIds:['ig']});
  assert.equal(result?.valid,false);
  assert.ok(result?.errors.includes('IG_ALBUM_MAX'));
});

test('legacy assetId thay ảnh thực tế trong variant',async()=>{
  const {repos,content,assets}=await setup(2);
  const item=await content.create('b',{type:'IMAGE',title:'Single',masterAssetId:assets[0]!});
  const variant=(await content.copyMasterToAll('b',item.id)).find(row=>row.platform==='FACEBOOK')!;
  const updated=await content.updateVariant('b',variant.id,{assetId:assets[1]!});
  assert.equal(updated.assetId,assets[1]);
  assert.deepEqual((await repos.variantMedia.findBy({contentVariantId:variant.id})).map(row=>row.mediaAssetId),[assets[1]]);
});

test('preflight cập nhật SHORT sau khi metadata video xuất hiện',async()=>{
  const {repos,content}=await setup(2);
  await repos.media.insert({id:'clip',brandId:'b',workspaceId:'w',type:'VIDEO',storageKey:'raw/clip',mimeType:'video/mp4'});
  const item=await content.create('b',{type:'VIDEO',title:'Clip',masterAssetId:'clip'});
  const variant=(await content.copyMasterToAll('b',item.id)).find(row=>row.platform==='YOUTUBE')!;
  assert.equal(variant.format,'VIDEO');
  await repos.media.update('clip',{width:1080,height:1920,durationMs:70_000});
  await content.preflightVariant('b',variant.id);
  assert.equal((await repos.variants.get(variant.id))?.format,'SHORT');
});
