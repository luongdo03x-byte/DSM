import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {test} from 'node:test';
import {ContentService} from '../../apps/api/src/modules/content/content.service.ts';
import {InMemoryObjectStorage,MediaService} from '../../apps/api/src/modules/media/media.service.ts';
import {prepareVariantMedia} from '../../apps/worker/src/media/media-jobs.ts';
import {PublishInputBuilder} from '../../apps/worker/src/publishing/publish-input.builder.ts';
import {MEDIA_RULES} from '../../packages/shared/src/media-rules.ts';
import {MemoryRepositories} from '../../packages/shared/src/memory-repositories.ts';
import {MemoryStore} from '../../packages/shared/src/store.ts';
const require=createRequire(new URL('../../apps/worker/package.json',import.meta.url));
const sharp=require('sharp') as typeof import('../../apps/worker/node_modules/sharp/lib/index.js');

test('derive JPEG theo crop, tái dùng asset và giữ thứ tự publish input',async()=>{
  const repos=new MemoryRepositories(new MemoryStore()),storage=new InMemoryObjectStorage();
  await repos.workspaces.insert({id:'w',name:'W'});
  await repos.brands.insert({id:'b',workspaceId:'w',name:'B',slug:'b',language:'vi',timezone:'UTC',currency:'USD',status:'ACTIVE'});
  const files=['sample.png','gps.jpg','sample.heic'];
  for(const [i,file] of files.entries()){
    const bytes=await readFile(join(import.meta.dirname,'../fixtures/media',file));
    await storage.putObject(`raw/${i}`,bytes,file.endsWith('png')?'image/png':file.endsWith('heic')?'image/heic':'image/jpeg');
    await repos.media.insert({id:`m${i}`,brandId:'b',workspaceId:'w',type:'IMAGE',storageKey:`raw/${i}`,mimeType:file.endsWith('png')?'image/png':file.endsWith('heic')?'image/heic':'image/jpeg',sizeBytes:bytes.length,width:1080,height:1080});
  }
  const content=new ContentService(repos);
  const item=await content.create('b',{type:'ALBUM',title:'Album',mediaAssetIds:['m0','m1','m2']});
  const variant=(await content.copyMasterToAll('b',item.id)).find(row=>row.platform==='INSTAGRAM')!;
  await content.setVariantMedia('b',variant.id,[{mediaAssetId:'m2',isCover:true},{mediaAssetId:'m0',crop:{x:10,y:0,width:80,height:100}},{mediaAssetId:'m1'}]);
  const first=await prepareVariantMedia(repos,storage,variant.id,MEDIA_RULES.INSTAGRAM);
  assert.deepEqual(first.map(asset=>asset.derivedFromAssetId),['m2','m0','m1']);
  assert.ok(first.every(asset=>asset.mimeType==='image/jpeg'&&asset.exifStripped));
  for(const asset of first){const bytes=await storage.getObject(asset.storageKey);assert.equal((await sharp(bytes).metadata()).format,'jpeg');assert.ok(Math.abs(asset.width!/asset.height!-0.8)<0.01)}
  const second=await prepareVariantMedia(repos,storage,variant.id,MEDIA_RULES.INSTAGRAM);
  assert.deepEqual(second.map(asset=>asset.id),first.map(asset=>asset.id));
  assert.equal((await repos.media.findBy({derivedFromAssetId:'m0'})).length,1);
  const builder=new PublishInputBuilder(repos,new MediaService(repos,storage),{publicMediaBaseUrl:'https://media.example.test/'});
  const input=await builder.build({brandId:'b',socialAccountId:'ig',contentVariantId:variant.id,platform:'INSTAGRAM'});
  assert.deepEqual(input.media?.map(media=>media.url),first.map(asset=>`https://media.example.test/${asset.storageKey}`));
  assert.equal(input.mediaUrl,input.media?.[0]?.url);
});

test('video gốc được probe một lần và giữ asset gốc',async()=>{
  const repos=new MemoryRepositories(new MemoryStore()),storage=new InMemoryObjectStorage();
  await repos.workspaces.insert({id:'w',name:'W'});
  await repos.brands.insert({id:'b',workspaceId:'w',name:'B',slug:'b',language:'vi',timezone:'UTC',currency:'USD',status:'ACTIVE'});
  const bytes=await readFile(join(import.meta.dirname,'../fixtures/media/vertical-3s.mp4'));
  await storage.putObject('raw/video',bytes,'video/mp4');
  await repos.media.insert({id:'video',brandId:'b',workspaceId:'w',type:'VIDEO',storageKey:'raw/video',mimeType:'video/mp4'});
  const content=new ContentService(repos);
  const item=await content.create('b',{type:'VIDEO',title:'Clip',masterAssetId:'video'});
  const variant=(await content.copyMasterToAll('b',item.id)).find(row=>row.platform==='YOUTUBE')!;
  const [asset]=await prepareVariantMedia(repos,storage,variant.id,MEDIA_RULES.YOUTUBE);
  assert.equal(asset?.id,'video');assert.equal(asset?.width,1080);assert.equal(asset?.height,1920);
  assert.ok(Math.abs((asset?.durationMs??0)-3000)<100);assert.equal(asset?.codec,'h264');
  assert.equal((await repos.media.findBy({derivedFromAssetId:'video'})).length,0);
});
