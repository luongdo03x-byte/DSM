import type {TikTokHttpClient} from '../../../../integrations/tiktok/tiktok-http.client.ts';
import {PublishError} from '../../../../../../../packages/platform-contracts/src/index.ts';

export class TikTokStatusService {
  private readonly http:TikTokHttpClient;
  private readonly tokens:(accountId:string)=>Promise<string>;
  constructor(http:TikTokHttpClient,tokens:(accountId:string)=>Promise<string>) {this.http=http;this.tokens=tokens}
  async fetch(accountId:string,publishId:string) {
    const token=await this.tokens(accountId);
    const response=await this.http.api('/v2/post/publish/status/fetch/',token,'POST',{publish_id:publishId},accountId);
    const status=response.data??response;
    if(status.status==='FAILED')throw new PublishError({type:'PLATFORM_ERROR',code:String(status.fail_reason??'TIKTOK_FAILED'),message:String(status.fail_reason??'TikTok publish failed'),retryable:false});
    const ids=status.publicaly_available_post_id??status.publicly_available_post_id??[];
    return {status:String(status.status??''),postId:ids[0]!==undefined?String(ids[0]):undefined,uploadedBytes:status.uploaded_bytes};
  }
}
