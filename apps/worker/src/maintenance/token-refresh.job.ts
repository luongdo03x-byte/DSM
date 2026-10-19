import type {Platform,SocialAccount} from '../../../../packages/shared/src/domain.ts';
import type {Repositories} from '../../../../packages/shared/src/repositories.ts';
import type {PlatformAdapter} from '../../../../packages/platform-contracts/src/adapter.ts';
import type {NotificationEvent} from '../../../../packages/shared/src/notifications.ts';

export const TOKEN_WARN_BEFORE_MS=7*24*60*60_000;
type RefreshAdapter=Pick<PlatformAdapter,'refreshToken'>;
export async function refreshExpiringTokens(deps:{repos:Repositories;adapters:Partial<Record<Platform,RefreshAdapter>>;now:number;notify?:(event:NotificationEvent)=>Promise<void>}):Promise<{refreshed:number;expiringSoon:SocialAccount[]}>{
  let refreshed=0;const expiringSoon:SocialAccount[]=[];
  for(const account of await deps.repos.socialAccounts.findBy({status:'CONNECTED'})){
    const credential=(await deps.repos.credentials.findBy({socialAccountId:account.id}))[0];
    if(!credential?.expiresAt||credential.expiresAt>deps.now+TOKEN_WARN_BEFORE_MS)continue;
    const adapter=deps.adapters[account.platform];
    if(!adapter){expiringSoon.push(account);if(deps.notify)await deps.notify({kind:'TOKEN_EXPIRING',brandId:account.brandId,socialAccountId:account.id,platform:account.platform,expiresAt:credential.expiresAt});continue}
    try{
      const result=await adapter.refreshToken(account);
      if(result.refreshed){refreshed++;if(result.expiresAt)await deps.repos.credentials.update(credential.id,{expiresAt:result.expiresAt});continue}
    }catch(error){if((error as {type?:string})?.type==='AUTH_ERROR'){await deps.repos.socialAccounts.update(account.id,{status:'EXPIRED'});if(deps.notify)await deps.notify({kind:'ACCOUNT_EXPIRED',brandId:account.brandId,socialAccountId:account.id,platform:account.platform});continue}}
    expiringSoon.push(account);
    if(deps.notify)await deps.notify({kind:'TOKEN_EXPIRING',brandId:account.brandId,socialAccountId:account.id,platform:account.platform,expiresAt:credential.expiresAt});
  }
  return{refreshed,expiringSoon};
}
