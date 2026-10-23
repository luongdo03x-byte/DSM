import type {OAuthConnector,OAuthTokens,ConnectableAccount} from '../../../../../packages/platform-contracts/src/oauth.ts';
import type {TokenRefreshResult} from '../../../../../packages/platform-contracts/src/adapter.ts';
import {PublishError} from '../../../../../packages/platform-contracts/src/index.ts';
import type {HttpClient} from '../../../../../packages/shared/src/http.ts';
import type {Repositories} from '../../../../../packages/shared/src/repositories.ts';
import type {SocialAccount} from '../../../../../packages/shared/src/domain.ts';
import {CredentialCryptoService} from '../../modules/accounts/credential-crypto.service.ts';
import type {GoogleConfig} from './google.config.ts';

export const GOOGLE_SCOPES=['https://www.googleapis.com/auth/youtube.upload','https://www.googleapis.com/auth/youtube.readonly','https://www.googleapis.com/auth/yt-analytics.readonly','https://www.googleapis.com/auth/youtube.force-ssl'];
export class GoogleOAuthConnector implements OAuthConnector{
  readonly provider='GOOGLE' as const;
  private readonly http:HttpClient;private readonly config:GoogleConfig;
  constructor(deps:{http:HttpClient;config:GoogleConfig}){this.http=deps.http;this.config=deps.config}
  authorizeUrl(state:string,redirectUri=this.config.redirectUri,codeChallenge?:string):string{
    const url=new URL(this.config.authBaseUrl);
    for(const [key,value] of Object.entries({client_id:this.config.clientId,redirect_uri:redirectUri,response_type:'code',scope:GOOGLE_SCOPES.join(' '),access_type:'offline',prompt:'consent',state}))url.searchParams.set(key,value);
    if(codeChallenge){url.searchParams.set('code_challenge',codeChallenge);url.searchParams.set('code_challenge_method','S256')}
    return url.toString();
  }
  private async token(form:URLSearchParams):Promise<OAuthTokens>{
    const response=await this.http.request({url:this.config.tokenUrl,method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:form.toString()});
    const value=response.data as Record<string,any>;
    if(response.status>=400||value.error){const code=String(value.error??`HTTP_${response.status}`);throw new PublishError({type:code==='invalid_grant'?'AUTH_ERROR':'PLATFORM_ERROR',code,message:String(value.error_description??code),retryable:response.status>=500})}
    if(!value.access_token)throw new PublishError({type:'AUTH_ERROR',code:'GOOGLE_TOKEN_MISSING',message:'Google did not return an access token',retryable:false});
    return{accessToken:String(value.access_token),...(value.refresh_token?{refreshToken:String(value.refresh_token)}:{}),...(value.expires_in?{expiresAt:Date.now()+Number(value.expires_in)*1000}:{}),scopes:String(value.scope??GOOGLE_SCOPES.join(' ')).split(' ').filter(Boolean)};
  }
  async exchangeCode(code:string,redirectUri=this.config.redirectUri,codeVerifier?:string):Promise<OAuthTokens>{
    const form=new URLSearchParams({client_id:this.config.clientId,client_secret:this.config.clientSecret,code,redirect_uri:redirectUri,grant_type:'authorization_code'});if(codeVerifier)form.set('code_verifier',codeVerifier);return this.token(form);
  }
  refreshToken(refreshToken:string):Promise<OAuthTokens>{return this.token(new URLSearchParams({client_id:this.config.clientId,client_secret:this.config.clientSecret,refresh_token:refreshToken,grant_type:'refresh_token'}))}
  async listAccounts(tokens:OAuthTokens):Promise<ConnectableAccount[]>{
    const response=await this.http.request({url:`${this.config.youtubeBaseUrl}/youtube/v3/channels?part=snippet&mine=true`,headers:{authorization:`Bearer ${tokens.accessToken}`}});
    if(response.status>=400)throw new PublishError({type:response.status===401?'AUTH_ERROR':'PLATFORM_ERROR',code:`YOUTUBE_CHANNELS_${response.status}`,message:'Cannot list YouTube channels',retryable:response.status>=500});
    const data=response.data as {items?:Array<{id:string;snippet?:{title?:string;thumbnails?:{default?:{url?:string}}}}>}|undefined;
    return(data?.items??[]).filter(item=>item.id).map(item=>({platform:'YOUTUBE',platformAccountId:item.id,providerUserId:item.id,displayName:item.snippet?.title??item.id,...(item.snippet?.thumbnails?.default?.url?{pictureUrl:item.snippet.thumbnails.default.url}:{}),tokens}));
  }
}
export class GoogleTokenRefreshService{
  private readonly repos:Repositories;private readonly crypto:CredentialCryptoService;private readonly connector:GoogleOAuthConnector;
  constructor(repos:Repositories,crypto:CredentialCryptoService,connector:GoogleOAuthConnector){this.repos=repos;this.crypto=crypto;this.connector=connector}
  async refresh(account:SocialAccount):Promise<TokenRefreshResult>{
    const credential=(await this.repos.credentials.findBy({socialAccountId:account.id}))[0];if(!credential?.refreshCiphertext)return{refreshed:false};
    const aad=`social-account:${account.id}:GOOGLE`,old=await this.crypto.decrypt(JSON.parse(credential.refreshCiphertext),aad);
    const tokens=await this.connector.refreshToken(old),access=await this.crypto.encrypt(tokens.accessToken,aad),refresh=await this.crypto.encrypt(tokens.refreshToken??old,aad);
    await this.repos.transaction(async tx=>{await tx.credentials.update(credential.id,{...access,refreshCiphertext:JSON.stringify(refresh),...(tokens.expiresAt?{expiresAt:tokens.expiresAt}:{})});await tx.socialAccounts.update(account.id,{status:'CONNECTED'})});
    return{refreshed:true,...(tokens.expiresAt?{expiresAt:tokens.expiresAt}:{})};
  }
  refreshToken(account:SocialAccount):Promise<TokenRefreshResult>{return this.refresh(account)}
}
