import {id} from '../../../../packages/shared/src/ids.ts';
import type {NotificationChannel} from '../../../../packages/shared/src/domain.ts';
import type {Repositories} from '../../../../packages/shared/src/repositories.ts';
import type {NotificationEvent,Notifier} from '../../../../packages/shared/src/notifications.ts';

export class NotificationDispatcher{
  private readonly repos:Repositories;
  private readonly notifiers:Record<NotificationChannel['kind'],Notifier>;
  constructor(repos:Repositories,notifiers:Record<NotificationChannel['kind'],Notifier>){this.repos=repos;this.notifiers=notifiers}
  async dispatch(workspaceId:string,event:NotificationEvent):Promise<{sent:number;failed:number}>{
    const channels=(await this.repos.notificationChannels.findBy({workspaceId})).filter(channel=>channel.enabled);
    let sent=0,failed=0;
    for(const channel of channels){
      try{await this.notifiers[channel.kind].send(channel,event);sent++}
      catch(error){failed++;await this.repos.audit.append({id:id('audit'),workspaceId,action:'NOTIFICATION_FAILED',entityType:'NOTIFICATION_CHANNEL',entityId:channel.id,metadata:{kind:event.kind,reason:error instanceof Error?error.message:'UNKNOWN'},createdAt:Date.now()}).catch(()=>{})}
    }
    return{sent,failed};
  }
}
