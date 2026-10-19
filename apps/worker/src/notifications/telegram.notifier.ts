import type {NotificationChannel} from '../../../../packages/shared/src/domain.ts';
import {renderVietnamese,type NotificationEvent,type Notifier} from '../../../../packages/shared/src/notifications.ts';

export class TelegramNotifier implements Notifier{
  private readonly token:string;
  private readonly baseUrl:string;
  private readonly appUrl:string;
  private readonly fetcher:typeof fetch;
  constructor(options:{token:string;baseUrl?:string;appUrl:string;fetcher?:typeof fetch}){this.token=options.token;this.baseUrl=(options.baseUrl??'https://api.telegram.org').replace(/\/$/,'');this.appUrl=options.appUrl;this.fetcher=options.fetcher??fetch}
  async send(channel:NotificationChannel,event:NotificationEvent):Promise<void>{
    if(!this.token)throw new Error('TELEGRAM_BOT_TOKEN_REQUIRED');
    const message=renderVietnamese(event,this.appUrl);
    const response=await this.fetcher(`${this.baseUrl}/bot${this.token}/sendMessage`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({chat_id:channel.target,text:`${message.subject}\n\n${message.text}`})});
    if(!response.ok||!(await response.json() as {ok?:boolean}).ok)throw new Error('TELEGRAM_SEND_FAILED');
  }
}
