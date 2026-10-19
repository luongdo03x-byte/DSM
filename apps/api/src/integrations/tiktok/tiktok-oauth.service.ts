import {randomToken,signToken,verifyToken} from '../../../../../packages/shared/src/security.ts';import type {TikTokConfig} from './tiktok.config.ts';import {TikTokHttpClient} from './tiktok-http.client.ts';import type {AccountsService} from '../../modules/accounts/accounts.service.ts';
import type {ConnectableAccount,OAuthConnector,OAuthTokens} from '../../../../../packages/platform-contracts/src/oauth.ts';
import type {TokenRefreshResult} from '../../../../../packages/platform-contracts/src/adapter.ts';
import type {SocialAccount} from '../../../../../packages/shared/src/domain.ts';
import type {Repositories} from '../../../../../packages/shared/src/repositories.ts';
import {CredentialCryptoService} from '../../modules/accounts/credential-crypto.service.ts';

export const TIKTOK_SCOPES=['user.info.basic','video.publish','video.upload'];
export class TikTokOAuthConnector implements OAuthConnector{
  readonly provider='TIKTOK' as const;
  private readonly http:TikTokHttpClient;private readonly config:TikTokConfig;
  constructor(deps:{http:TikTokHttpClient;config:TikTokConfig}){this.http=deps.http;this.config=deps.config}
  authorizeUrl(state:string,redirectUri=this.config.redirectUri,codeChallenge?:string):string{
    const url=new URL(this.config.authBaseUrl);for(const [key,value] of Object.entries({client_key:this.config.clientKey,redirect_uri:redirectUri,response_type:'code',scope:TIKTOK_SCOPES.join(','),state}))url.searchParams.set(key,value);
    if(codeChallenge){url.searchParams.set('code_challenge',codeChallenge);url.searchParams.set('code_challenge_method','S256')}
    return url.toString();
  }
  async exchangeCode(code:string,redirectUri=this.config.redirectUri,codeVerifier?:string):Promise<OAuthTokens>{
    const form=new URLSearchParams({client_key:this.config.clientKey,client_secret:this.config.clientSecret,code,grant_type:'authorization_code',redirect_uri:redirectUri});if(codeVerifier)form.set('code_verifier',codeVerifier);
    return this.toTokens(await this.http.oauth(form));
  }
  async refreshToken(refreshToken:string):Promise<OAuthTokens>{return this.toTokens(await this.http.oauth(new URLSearchParams({client_key:this.config.clientKey,client_secret:this.config.clientSecret,grant_type:'refresh_token',refresh_token:refreshToken})))}
  async listAccounts(tokens:OAuthTokens):Promise<ConnectableAccount[]>{
    const response=await this.http.api('/v2/user/info/?fields=open_id,display_name,avatar_url',tokens.accessToken,'GET');
    const user=response.data?.user??response.user??{};const openId=String(user.open_id??'');if(!openId)throw new Error('TIKTOK_OPEN_ID_MISSING');
    return[{platform:'TIKTOK',platformAccountId:openId,providerUserId:openId,displayName:String(user.display_name??openId),tokens}];
  }
  private toTokens(raw:any):OAuthTokens{const value=raw.data??raw;return{accessToken:String(value.access_token),...(value.refresh_token?{refreshToken:String(value.refresh_token)}:{}),...(value.expires_in?{expiresAt:Date.now()+Number(value.expires_in)*1000}:{}),scopes:String(value.scope??TIKTOK_SCOPES.join(',')).split(',').map(x=>x.trim()).filter(Boolean)}}
}
export class TikTokTokenRefreshService{
  private readonly repos:Repositories;private readonly crypto:CredentialCryptoService;private readonly connector:TikTokOAuthConnector;
  constructor(repos:Repositories,crypto:CredentialCryptoService,connector:TikTokOAuthConnector){this.repos=repos;this.crypto=crypto;this.connector=connector}
  async refresh(account:SocialAccount):Promise<TokenRefreshResult>{
    const credential=(await this.repos.credentials.findBy({socialAccountId:account.id}))[0];if(!credential?.refreshCiphertext)return{refreshed:false};
    const aad='social-account:'+account.id+':TIKTOK',old=await this.crypto.decrypt(JSON.parse(credential.refreshCiphertext),aad),tokens=await this.connector.refreshToken(old);
    const access=await this.crypto.encrypt(tokens.accessToken,aad),refresh=await this.crypto.encrypt(tokens.refreshToken??old,aad);
    await this.repos.transaction(async tx=>{await tx.credentials.update(credential.id,{...access,refreshCiphertext:JSON.stringify(refresh),...(tokens.expiresAt?{expiresAt:tokens.expiresAt}:{})});await tx.socialAccounts.update(account.id,{status:'CONNECTED'})});
    return{refreshed:true,...(tokens.expiresAt?{expiresAt:tokens.expiresAt}:{})};
  }
}
export class TikTokOAuthService{private c:TikTokConfig;private h:TikTokHttpClient;private accounts:AccountsService;private secret:string;private used=new Set<string>();constructor(c:TikTokConfig,h:TikTokHttpClient,accounts:AccountsService,stateSecret:string){this.c=c;this.h=h;this.accounts=accounts;this.secret=stateSecret}async getAuthorizationUrl(input:{brandId:string;userId:string}){const nonce=randomToken(12),state=await signToken({...input,nonce},this.secret,600);const q=new URLSearchParams({client_key:this.c.clientKey,scope:'user.info.basic,video.publish,video.list',response_type:'code',redirect_uri:this.c.redirectUri,state});return `${this.c.authBaseUrl}?${q}`}async handleCallback(accountId:string,code:string,state:string){const d=await verifyToken<any>(state,this.secret);if(this.used.has(d.nonce))throw new Error('OAUTH_STATE_REPLAY');this.used.add(d.nonce);const form=new URLSearchParams({client_key:this.c.clientKey,client_secret:this.c.clientSecret,code,grant_type:'authorization_code',redirect_uri:this.c.redirectUri});const out:any=await this.h.oauth(form);await this.accounts.saveCredential(accountId,'tiktok',out.access_token,out.refresh_token);const account=(this.accounts as any).store?.socialAccounts?.get?.(accountId);if(account&&out.open_id)account.platformAccountId=out.open_id;return{openId:out.open_id,authorized:true,directPostApproved:this.c.directPostApproved,publicPostingReady:this.c.directPostApproved}}}
