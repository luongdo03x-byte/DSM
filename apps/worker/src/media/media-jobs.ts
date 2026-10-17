import {createHash} from 'node:crypto';
import {mkdtemp,writeFile,unlink,rmdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {id} from '../../../../packages/shared/src/ids.ts';
import type {MediaAsset,VariantMedia} from '../../../../packages/shared/src/domain.ts';
import type {Repositories} from '../../../../packages/shared/src/repositories.ts';
import type {PlatformRule} from '../../../../packages/shared/src/media-rules.ts';
import {inferFormat} from '../../../../packages/shared/src/preflight.ts';
import type {ObjectStorage} from '../../../api/src/modules/media/media.service.ts';
import {normalizeImage} from './image-normalizer.ts';
import {probeVideo} from './video-probe.ts';

export async function prepareVariantMedia(repos:Repositories,storage:ObjectStorage,variantId:string,rule:PlatformRule):Promise<MediaAsset[]> {
  const variant=await repos.variants.get(variantId);
  if(!variant)throw new Error('VARIANT_NOT_FOUND');
  if(variant.skippedReason)throw new Error('VARIANT_SKIPPED');
  const content=await repos.contents.get(variant.contentItemId);
  if(!content)throw new Error('CONTENT_NOT_FOUND');
  let rows=await repos.variantMedia.findBy({contentVariantId:variantId});
  if(!rows.length&&variant.assetId)rows=[{id:'legacy',contentVariantId:variantId,mediaAssetId:variant.assetId,position:0,isCover:true}];
  else if(!rows.length&&content.masterAssetId)rows=[{id:'legacy',contentVariantId:variantId,mediaAssetId:content.masterAssetId,position:0,isCover:true}];
  const result:MediaAsset[]=[];
  for(const row of rows){
    const source=await repos.media.get(row.mediaAssetId);
    if(!source||source.brandId!==content.brandId)throw new Error('MEDIA_NOT_FOUND');
    if(source.type==='VIDEO'){result.push(await videoFacts(repos,storage,source));continue}
    if(!rule.supportsImage)throw new Error('IMAGE_UNSUPPORTED');
    result.push(await deriveImage(repos,storage,source,row,variant.platform,rule));
  }
  if(content.type==='VIDEO'){
    const video=result.find(asset=>asset.type==='VIDEO');
    if(video?.width&&video.height&&video.durationMs!==undefined){
      const inferred=inferFormat(variant.platform,content.type,[{kind:'VIDEO',mimeType:video.mimeType,width:video.width,height:video.height,sizeBytes:video.sizeBytes??0,durationMs:video.durationMs}]);
      if('format' in inferred&&variant.format!==inferred.format)await repos.variants.update(variantId,{format:inferred.format});
    }
  }
  return result;
}

async function videoFacts(repos:Repositories,storage:ObjectStorage,source:MediaAsset):Promise<MediaAsset> {
  if(source.width&&source.height&&source.durationMs&&source.codec)return source;
  const bytes=await storage.getObject(source.storageKey);
  const directory=await mkdtemp(join(tmpdir(),'dsm-probe-'));
  const file=join(directory,'input.mp4');
  try{
    await writeFile(file,bytes);
    const facts=await probeVideo(file);
    return repos.media.update(source.id,{width:facts.width,height:facts.height,durationMs:facts.durationMs,codec:facts.codec,sizeBytes:bytes.length});
  }finally{
    await unlink(file).catch(()=>{});
    await rmdir(directory).catch(()=>{});
  }
}

async function deriveImage(repos:Repositories,storage:ObjectStorage,source:MediaAsset,row:VariantMedia,platform:string,rule:PlatformRule):Promise<MediaAsset> {
  const aspect=rule.imageAspect;
  const cropHash=createHash('sha256').update(JSON.stringify(row.crop??null)).digest('hex').slice(0,16);
  const variantKey=`${platform}-${aspect?.w??0}x${aspect?.h??0}-${cropHash}`;
  const existing=(await repos.media.findBy({derivedFromAssetId:source.id,variantKey}))[0];
  if(existing)return existing;
  const input=await storage.getObject(source.storageKey);
  const normalized=await normalizeImage(input,{...(aspect?{aspect}:{}),...(row.crop?{crop:row.crop}:{}),maxBytes:8_000_000,maxLongEdge:platform==='TIKTOK'?1920:platform==='INSTAGRAM'?1350:2048});
  const key=`workspace/${source.workspaceId}/brand/${source.brandId}/media/derived/${source.id}/${variantKey}.jpg`;
  await storage.putObject(key,normalized.buffer,normalized.mimeType);
  const asset:MediaAsset={id:id('media'),brandId:source.brandId,workspaceId:source.workspaceId,type:'IMAGE',storageKey:key,mimeType:normalized.mimeType,sizeBytes:normalized.buffer.length,width:normalized.width,height:normalized.height,derivedFromAssetId:source.id,variantKey,exifStripped:true};
  try{return await repos.media.insert(asset)}catch(error){
    const raced=(await repos.media.findBy({derivedFromAssetId:source.id,variantKey}))[0];
    if(raced)return raced;
    throw error;
  }
}
