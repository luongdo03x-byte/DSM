import type {NotificationChannel} from '../../../../packages/shared/src/domain.ts';
import {renderVietnamese,type NotificationEvent,type Notifier} from '../../../../packages/shared/src/notifications.ts';

type TokenPair={access_token:string;refresh_token:string};
export class ZaloNotifier implements Notifier{
  private accessToken:string;
  private refreshToken:string|undefined;
  private readonly appId:string|undefined;
  private readonly appSecret:string|undefined;
  private readonly appUrl:string;
  private readonly fetcher:typeof fetch;
  private readonly onTokenRefresh:((tokens:TokenPair)=>Promise<void>)|undefined;
  constructor(options:{accessToken:string;refreshToken?:string;appId?:string;appSecret?:string;appUrl:string;fetcher?:typeof fetch;onTokenRefresh?:(tokens:TokenPair)=>Promise<void>}){
    this.accessToken=options.accessToken;this.refreshToken=options.refreshToken;this.appId=options.appId;this.appSecret=options.appSecret;this.appUrl=options.appUrl;this.fetcher=options.fetcher??fetch;this.onTokenRefresh=options.onTokenRefresh;
  }
  private async refresh():Promise<void>{
    if(!this.refreshToken||!this.appId||!this.appSecret)throw new Error('ZALO_OA_TOKEN_EXPIRED');
    const body=new URLSearchParams({refresh_token:this.refreshToken,app_id:this.appId,grant_type:'refresh_token'});
    const response=await this.fetcher('https://oauth.zaloapp.com/v4/oa/access_token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded',secret_key:this.appSecret},body});
    if(!response.ok)throw new Error('ZALO_OA_REFRESH_FAILED');
    const data=await response.json() as Partial<TokenPair>;
    if(!data.access_token||!data.refresh_token)throw new Error('ZALO_OA_REFRESH_FAILED');
    if(this.onTokenRefresh)await this.onTokenRefresh({access_token:data.access_token,refresh_token:data.refresh_token});
    this.accessToken=data.access_token;this.refreshToken=data.refresh_token;
  }
  async send(channel:NotificationChannel,event:NotificationEvent):Promise<void>{
    if(!this.accessToken)throw new Error('ZALO_OA_ACCESS_TOKEN_REQUIRED');
    if(!channel.target)throw new Error('ZALO_FOLLOWER_ID_REQUIRED');
    const message=renderVietnamese(event,this.appUrl);
    const send=()=>this.fetcher('https://openapi.zalo.me/v3.0/oa/message/cs',{method:'POST',headers:{access_token:this.accessToken,'content-type':'application/json'},body:JSON.stringify({recipient:{user_id:channel.target},message:{text:`${message.subject}\n\n${message.text}`}})});
    let response=await send();
    if(response.status===401){await this.refresh();response=await send()}
    if(!response.ok)throw new Error('ZALO_SEND_FAILED');
    const data=await response.json() as {error?:number};if(data.error!==0)throw new Error('ZALO_SEND_FAILED');
  }
}
