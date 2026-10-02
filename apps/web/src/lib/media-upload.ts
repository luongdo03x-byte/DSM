export interface MediaUploadApi{request<T=unknown>(path:string,init?:{method?:string;headers?:Record<string,string>;body?:string}):Promise<T>}
export type RawUploadFetch=(url:string,init:{method:'PUT';headers:Record<string,string>;body:unknown})=>Promise<{ok:boolean;status:number}>;
export async function uploadMediaAsset(api:MediaUploadApi,brandId:string,file:{type:string},rawFetch:RawUploadFetch=fetch as any){
  const type=file.type.startsWith('image/')?'IMAGE':file.type.startsWith('video/')?'VIDEO':null;if(!type)throw new Error('UNSUPPORTED_MEDIA_TYPE');
  const signed=await api.request<{assetId:string;uploadUrl:string}>(`/brands/${brandId}/media/uploads`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type,mimeType:file.type})});
  const uploaded=await rawFetch(signed.uploadUrl,{method:'PUT',headers:{'content-type':file.type},body:file});if(!uploaded.ok)throw new Error(`MEDIA_UPLOAD_FAILED:${uploaded.status}`);return signed.assetId;
}
