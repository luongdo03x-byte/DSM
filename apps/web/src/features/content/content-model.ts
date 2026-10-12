export const CONTENT_PLATFORMS=['FACEBOOK','INSTAGRAM','THREADS','TIKTOK'] as const;
export type ContentPlatform=typeof CONTENT_PLATFORMS[number];
export type ContentVariantSnapshot={id:string;platform:string;status?:string;caption?:string;body?:string};

export function platformVariant<T extends ContentVariantSnapshot>(variants:T[],platform:string):T|undefined{
  return variants.find(variant=>variant.platform===platform);
}

export function variantReadiness(variants:ContentVariantSnapshot[]){
  return CONTENT_PLATFORMS.map(platform=>{
    const variant=platformVariant(variants,platform);
    return {platform,exists:!!variant,ready:variant?.status==='READY',status:variant?.status??'MISSING'};
  });
}

export type PublishValidation={socialAccountId:string;platform:string;valid:boolean;errors?:string[];warnings?:string[]};
export function publishTargetSummary(results:PublishValidation[]){
  const validTargets=results.filter(result=>result.valid);
  const invalidTargets=results.filter(result=>!result.valid);
  return {validTargets,invalidTargets,validCount:validTargets.length,invalidCount:invalidTargets.length,canPublish:validTargets.length>0};
}

export function contentStatusLabel(status:string|undefined){
  if(status==='READY')return 'Sẵn sàng';
  if(status==='ARCHIVED')return 'Đã lưu trữ';
  if(status==='MISSING')return 'Chưa tạo';
  return 'Bản nháp';
}

export function contentPreview(
  master:{body?:string|null},
  variants:ContentVariantSnapshot[],
  platform:string
){
  const variant=platformVariant(variants,platform);
  return {
    text:variant?.caption?.trim()||variant?.body?.trim()||master.body?.trim()||'',
    hasVariant:!!variant,
    ready:variant?.status==='READY'
  };
}
