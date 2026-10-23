import {randomToken,signToken,verifyToken} from '../../../../../packages/shared/src/security.ts';import type {Platform} from '../../../../../packages/shared/src/domain.ts';
import type {ConnectableAccount,OAuthConnector,OAuthTokens} from '../../../../../packages/platform-contracts/src/oauth.ts';
import {MetaGraphClient} from './meta-http.client.ts';

export const META_SCOPES=['pages_show_list','pages_read_engagement','pages_manage_posts','read_insights','instagram_basic','instagram_content_publish','instagram_manage_insights','business_management'];
export const META_COMMENT_SCOPES=['pages_manage_metadata','pages_manage_engagement','pages_read_user_content','instagram_manage_comments','pages_messaging','instagram_manage_messages'];
export class MetaOAuthConnector implements OAuthConnector {
  readonly provider='META' as const;
  private readonly scopes:string[];private readonly graph:MetaGraphClient;private readonly appId:string;private readonly appSecret:string;private readonly redirectUri:string;private readonly authBaseUrl:string;
  constructor(opts:{graph:MetaGraphClient;appId:string;appSecret:string;redirectUri:string;authBaseUrl?:string;scopes?:string[]}){this.scopes=[...(opts.scopes??META_SCOPES)];this.graph=opts.graph;this.appId=opts.appId;this.appSecret=opts.appSecret;this.redirectUri=opts.redirectUri;this.authBaseUrl=opts.authBaseUrl??'https://www.facebook.com/v24.0/dialog/oauth'}
  authorizeUrl(state:string,redirectUri=this.redirectUri){const url=new URL(this.authBaseUrl);url.searchParams.set('client_id',this.appId);url.searchParams.set('redirect_uri',redirectUri);url.searchParams.set('scope',this.scopes.join(','));url.searchParams.set('response_type','code');url.searchParams.set('state',state);return url.toString()}
  async exchangeCode(code:string,redirectUri=this.redirectUri):Promise<OAuthTokens>{
    const short=await this.graph.get<{access_token:string;expires_in?:number}>('/oauth/access_token','',{client_id:this.appId,client_secret:this.appSecret,redirect_uri:redirectUri,code});
    const long=await this.graph.get<{access_token:string;expires_in?:number}>('/oauth/access_token','',{grant_type:'fb_exchange_token',client_id:this.appId,client_secret:this.appSecret,fb_exchange_token:short.access_token});
    return {accessToken:long.access_token,...(long.expires_in?{expiresAt:Date.now()+long.expires_in*1000}:{}),scopes:this.scopes};
  }
  async listAccounts(tokens:OAuthTokens):Promise<ConnectableAccount[]>{
    const identity=await this.graph.get<{id:string}>('/me',tokens.accessToken,{fields:'id'});
    const accounts:ConnectableAccount[]=[];
    let after:string|undefined;const seen=new Set<string>();
    do {
      const result=await this.graph.get<{data:Array<{id:string;name:string;access_token:string;instagram_business_account?:{id:string;username?:string}}>;paging?:{next?:string;cursors?:{after?:string}}}>('/me/accounts',tokens.accessToken,{fields:'id,name,access_token,instagram_business_account{id,username}',...(after?{after}:{})});
      for(const page of result.data??[]){const pageTokens={accessToken:page.access_token,refreshToken:tokens.accessToken,...(tokens.expiresAt?{expiresAt:tokens.expiresAt}:{}),scopes:tokens.scopes};accounts.push({platform:'FACEBOOK',platformAccountId:page.id,displayName:page.name,providerUserId:identity.id,tokens:pageTokens});if(page.instagram_business_account)accounts.push({platform:'INSTAGRAM',platformAccountId:page.instagram_business_account.id,displayName:page.instagram_business_account.username??page.name,...(page.instagram_business_account.username?{username:page.instagram_business_account.username}:{}),providerUserId:identity.id,tokens:pageTokens})}
      const next=result.paging?.next?result.paging.cursors?.after:undefined;after=next&&!seen.has(next)?next:undefined;if(after)seen.add(after);
    } while(after);
    return accounts;
  }
  async refreshUserToken(userToken:string):Promise<OAuthTokens>{
    const data=await this.graph.get<{access_token:string;expires_in?:number}>('/oauth/access_token','',{grant_type:'fb_exchange_token',client_id:this.appId,client_secret:this.appSecret,fb_exchange_token:userToken});
    return{accessToken:data.access_token,scopes:this.scopes,...(data.expires_in?{expiresAt:Date.now()+data.expires_in*1000}:{})};
  }
  async subscribePageComments(account:ConnectableAccount):Promise<boolean>{
    if(account.platform!=='FACEBOOK'||!account.tokens.scopes.includes('pages_manage_metadata'))return false;
    const result=await this.graph.post<{success?:boolean}>(`/${account.platformAccountId}/subscribed_apps`,account.tokens.accessToken,{subscribed_fields:'feed'});
    return result.success===true;
  }
}
export class MetaOAuthService{private secret:string;private used=new Set<string>();constructor(secret:string){this.secret=secret}async getAuthorizationUrl(input:{platform:Extract<Platform,'FACEBOOK'|'INSTAGRAM'|'THREADS'>;brandId:string;userId:string;returnPath?:string;clientId:string;redirectUri:string;authBaseUrl:string;scopes:string[]}){const nonce=randomToken(12),state=await signToken({...input,nonce},this.secret,600);return `${input.authBaseUrl}?client_id=${encodeURIComponent(input.clientId)}&redirect_uri=${encodeURIComponent(input.redirectUri)}&scope=${encodeURIComponent(input.scopes.join(','))}&state=${encodeURIComponent(state)}`}async consumeState(state:string){const d=await verifyToken<any>(state,this.secret);if(this.used.has(d.nonce))throw new Error('OAUTH_STATE_REPLAY');this.used.add(d.nonce);return d}}
