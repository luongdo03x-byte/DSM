import type {Platform,SocialAccount} from '../../../../packages/shared/src/domain.ts';
import type {Repositories} from '../../../../packages/shared/src/repositories.ts';
import type {PlatformAdapter} from '../../../../packages/platform-contracts/src/adapter.ts';

export const TOKEN_WARN_BEFORE_MS=7*24*60*60_000;
type RefreshAdapter=Pick<PlatformAdapter,'refreshToken'>;
export async function refreshExpiringTokens(deps:{repos:Repositories;adapters:Partial<Record<Platform,RefreshAdapter>>;now:number}):Promise<{refreshed:number;expiringSoon:SocialAccount[]}>{
  let refreshed=0;const expiringSoon:SocialAccount[]=[];
  for(const account of await deps.repos.socialAccounts.findBy({status:'CONNECTED'})){
    const credential=(await deps.repos.credentials.findBy({socialAccountId:account.id}))[0];
    if(!credential?.expiresAt||credential.expiresAt>deps.now+TOKEN_WARN_BEFORE_MS)continue;
    const adapter=deps.adapters[account.platform];
    if(!adapter){expiringSoon.push(account);continue}
    try{
      const result=await adapter.refreshToken(account);
      if(result.refreshed){refreshed++;if(result.expiresAt)await deps.repos.credentials.update(credential.id,{expiresAt:result.expiresAt});continue}
    }catch(error){if((error as {type?:string})?.type==='AUTH_ERROR'){await deps.repos.socialAccounts.update(account.id,{status:'EXPIRED'});continue}}
    expiringSoon.push(account);
  }
  return{refreshed,expiringSoon};
}
