import {PublishError} from '../../../../../packages/platform-contracts/src/index.ts';
import type {TokenRefreshResult} from '../../../../../packages/platform-contracts/src/adapter.ts';
import type {SocialAccount} from '../../../../../packages/shared/src/domain.ts';
import type {Repositories} from '../../../../../packages/shared/src/repositories.ts';
import {CredentialCryptoService} from '../../modules/accounts/credential-crypto.service.ts';
import {MetaOAuthConnector} from './meta-oauth.service.ts';

export class MetaTokenRefreshService {
  private readonly repos:Repositories;private readonly crypto:CredentialCryptoService;private readonly connector:MetaOAuthConnector;
  constructor(repos:Repositories,crypto:CredentialCryptoService,connector:MetaOAuthConnector){this.repos=repos;this.crypto=crypto;this.connector=connector}
  async refresh(account:SocialAccount):Promise<TokenRefreshResult>{
    const credential=(await this.repos.credentials.findBy({socialAccountId:account.id}))[0];
    if(!credential?.refreshCiphertext||!account.platformAccountId)return{refreshed:false};
    const aad='social-account:'+account.id+':'+credential.provider;
    const userToken=await this.crypto.decrypt(JSON.parse(credential.refreshCiphertext),aad);
    const updated=await this.connector.refreshUserToken(userToken);
    const listed=await this.connector.listAccounts(updated);
    const selected=listed.find(item=>item.platform===account.platform&&item.platformAccountId===account.platformAccountId);
    if(!selected)throw new PublishError({type:'AUTH_ERROR',code:'META_ACCOUNT_REVOKED',message:'Meta account is no longer available',retryable:false});
    const access=await this.crypto.encrypt(selected.tokens.accessToken,aad),refresh=await this.crypto.encrypt(updated.accessToken,aad);
    await this.repos.transaction(async tx=>{
      await tx.credentials.update(credential.id,{...access,refreshCiphertext:JSON.stringify(refresh),...(updated.expiresAt?{expiresAt:updated.expiresAt}:{}),scopes:updated.scopes,...(selected.providerUserId?{providerUserId:selected.providerUserId}:{})});
      await tx.socialAccounts.update(account.id,{status:'CONNECTED'});
    });
    return{refreshed:true,...(updated.expiresAt?{expiresAt:updated.expiresAt}:{})};
  }
}
