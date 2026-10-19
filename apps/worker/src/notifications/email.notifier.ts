import nodemailer from 'nodemailer';
import type {NotificationChannel} from '../../../../packages/shared/src/domain.ts';
import {renderVietnamese,type NotificationEvent,type Notifier} from '../../../../packages/shared/src/notifications.ts';

export class EmailNotifier implements Notifier{
  private readonly appUrl:string;
  private readonly from:string;
  private readonly transporter:{sendMail(message:{from:string;to:string;subject:string;text:string}):Promise<unknown>};
  constructor(options:{host:string;port:number;secure:boolean;user?:string;password?:string;from:string;appUrl:string;transporter?:{sendMail(message:{from:string;to:string;subject:string;text:string}):Promise<unknown>}}){
    this.appUrl=options.appUrl;this.from=options.from;
    this.transporter=options.transporter??nodemailer.createTransport({host:options.host,port:options.port,secure:options.secure,...(options.user&&options.password?{auth:{user:options.user,pass:options.password}}:{})});
  }
  async send(channel:NotificationChannel,event:NotificationEvent):Promise<void>{
    if(!this.from)throw new Error('SMTP_FROM_REQUIRED');
    const message=renderVietnamese(event,this.appUrl);
    await this.transporter.sendMail({from:this.from,to:channel.target,subject:message.subject,text:message.text});
  }
}
