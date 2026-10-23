import {createHash,randomBytes} from 'node:crypto';
import type {ConnectableAccount} from '../../../../../packages/platform-contracts/src/oauth.ts';
import type {Repositories} from '../../../../../packages/shared/src/repositories.ts';
import type {SocialAccount,OAuthPending} from '../../../../../packages/shared/src/domain.ts';
import {id} from '../../../../../packages/shared/src/ids.ts';
import {CredentialCryptoService} from '../accounts/credential-crypto.service.ts';
import {MetaOAuthConnector} from '../../integrations/meta/meta-oauth.service.ts';
import {TikTokOAuthConnector} from '../../integrations/tiktok/tiktok-oauth.service.ts';
import {GoogleOAuthConnector} from '../../integrations/google/google-oauth.connector.ts';
import {signState,verifyState} from './oauth-state.ts';

const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
export class IntegrationsService {
  private readonly repos:Repositories;private readonly crypto:CredentialCryptoService;private readonly meta:MetaOAuthConnector|undefined;private readonly tiktok:TikTokOAuthConnector|undefined;private readonly google:GoogleOAuthConnector|undefined;private readonly stateSecret:string;
  constructor(deps:{repos:Repositories;crypto:CredentialCryptoService;meta?:MetaOAuthConnector;tiktok?:TikTokOAuthConnector;google?:GoogleOAuthConnector;stateSecret:string}){this.repos=deps.repos;this.crypto=deps.crypto;this.meta=deps.meta;this.tiktok=deps.tiktok;this.google=deps.google;this.stateSecret=deps.stateSecret}
  async start(provider:'META'|'TIKTOK'|'GOOGLE',brandId:string,userId:string):Promise<{url:string}>{
    const nonce=randomBytes(16).toString('base64url'),state=signState({provider,brandId,userId,nonce},this.stateSecret,Date.now());
    if(provider==='META'){if(!this.meta)throw new Error('META_NOT_CONFIGURED');return{url:this.meta.authorizeUrl(state)}}
    const connector=provider==='GOOGLE'?this.google:this.tiktok;if(!connector)throw new Error(provider+'_NOT_CONFIGURED');
    const verifier=randomBytes(48).toString('base64url'),challenge=createHash('sha256').update(verifier).digest(provider==='GOOGLE'?'base64url':'hex');
    const sealed=await this.crypto.encrypt(verifier,'oauth-verifier:'+nonce);
    await this.repos.oauthPending.insert({id:nonce,brandId,userId,tokenHash:'authorization:'+hash(nonce),...sealed,expiresAt:Date.now()+10*60_000});
    return{url:connector.authorizeUrl(state,undefined,challenge)};
  }
  async callback(code:string,state:string):Promise<{brandId:string;token:string}>{
    const claims=verifyState(state,this.stateSecret,Date.now());
    if(claims.provider!=='META'&&claims.provider!=='TIKTOK'&&claims.provider!=='GOOGLE')throw new Error('OAUTH_STATE_INVALID');
    const existing=await this.repos.oauthPending.get(claims.nonce);
    if(claims.provider==='META'&&existing)throw new Error('OAUTH_STATE_REPLAY');
    if(claims.provider!=='META'&&(!existing||existing.tokenHash!=='authorization:'+hash(claims.nonce)||existing.expiresAt<Date.now()))throw new Error('OAUTH_STATE_REPLAY');
    const connector=claims.provider==='META'?this.meta:claims.provider==='GOOGLE'?this.google:this.tiktok;if(!connector)throw new Error('INVALID_PROVIDER');
    const verifier=claims.provider!=='META'?await this.crypto.decrypt(existing!,'oauth-verifier:'+claims.nonce):undefined;
    const tokens=claims.provider==='GOOGLE'?await this.google!.exchangeCode(code,undefined,verifier):claims.provider==='TIKTOK'?await this.tiktok!.exchangeCode(code,undefined,verifier):await this.meta!.exchangeCode(code);
    const accounts=await connector.listAccounts(tokens);
    const token=randomBytes(32).toString('base64url');const sealed=await this.crypto.encrypt(JSON.stringify(accounts),'oauth-pending:'+claims.nonce);
    const row={tokenHash:hash(token),...sealed,expiresAt:Date.now()+15*60_000};
    if(existing)await this.repos.oauthPending.update(claims.nonce,row);else await this.repos.oauthPending.insert({id:claims.nonce,brandId:claims.brandId,userId:claims.userId,...row});
    return {brandId:claims.brandId,token};
  }
  private async load(token:string):Promise<{row:OAuthPending;accounts:ConnectableAccount[]}>{
    if(!token)throw new Error('OAUTH_PENDING_INVALID');const row=(await this.repos.oauthPending.findBy({tokenHash:hash(token)}))[0];
    if(!row||row.expiresAt<Date.now())throw new Error('OAUTH_PENDING_INVALID');if(row.consumedAt)throw new Error('OAUTH_PENDING_CONSUMED');
    const accounts=JSON.parse(await this.crypto.decrypt(row,'oauth-pending:'+row.id)) as ConnectableAccount[];
    return {row,accounts};
  }
  async pending(token:string):Promise<ConnectableAccount[]>{return (await this.load(token)).accounts.map(({tokens:_,providerUserId:__,...account})=>({...account,tokens:{accessToken:'',scopes:[]}}))}
  async pendingOwner(token:string):Promise<{brandId:string;userId:string}>{const {row}=await this.load(token);return {brandId:row.brandId,userId:row.userId}}
  async confirm(token:string,platformAccountIds:string[]):Promise<SocialAccount[]>{
    const {row,accounts}=await this.load(token);const wanted=new Set(platformAccountIds);
    if(wanted.size!==platformAccountIds.length||wanted.size===0||accounts.some(x=>!x.platformAccountId)||[...wanted].some(x=>!accounts.some(account=>account.platformAccountId===x)))throw new Error('INVALID_ACCOUNT_SELECTION');
    const confirmed=await this.repos.transaction(async tx=>{
      const current=await tx.oauthPending.get(row.id);if(!current||current.consumedAt||current.expiresAt<Date.now())throw new Error('OAUTH_PENDING_CONSUMED');
      const result:SocialAccount[]=[];
      for(const account of accounts.filter(x=>wanted.has(x.platformAccountId))){
        let social=(await tx.socialAccounts.findBy({brandId:row.brandId,platform:account.platform,platformAccountId:account.platformAccountId}))[0];
        if(social)social=await tx.socialAccounts.update(social.id,{displayName:account.displayName,...(account.username?{username:account.username}:{}),publishMode:'API',status:'CONNECTED'});
        else social=await tx.socialAccounts.insert({id:id('acc'),brandId:row.brandId,platform:account.platform,platformAccountId:account.platformAccountId,displayName:account.displayName,...(account.username?{username:account.username}:{}),publishMode:'API',status:'CONNECTED'});
        const provider=account.platform==='YOUTUBE'?'GOOGLE':account.platform==='TIKTOK'?'TIKTOK':'META';const aad='social-account:'+social.id+':'+provider,encrypted=await this.crypto.encrypt(account.tokens.accessToken,aad);
        const refresh=account.tokens.refreshToken?await this.crypto.encrypt(account.tokens.refreshToken,aad):undefined;
        const credential={provider,...encrypted,...(refresh?{refreshCiphertext:JSON.stringify(refresh)}:{}),...(account.tokens.expiresAt?{expiresAt:account.tokens.expiresAt}:{}),...(account.providerUserId?{providerUserId:account.providerUserId}:{}),scopes:account.tokens.scopes};
        const existing=(await tx.credentials.findBy({socialAccountId:social.id}))[0];if(existing)await tx.credentials.update(existing.id,credential);else await tx.credentials.insert({id:id('cred'),socialAccountId:social.id,...credential});
        result.push(social);
      }
      await tx.oauthPending.update(row.id,{consumedAt:Date.now()});return result;
    });
    for(const account of accounts.filter(x=>wanted.has(x.platformAccountId)&&x.platform==='FACEBOOK')){
      try{await this.meta?.subscribePageComments(account)}catch(error){console.error('Meta Page feed subscription failed',error)}
    }
    return confirmed;
  }
}
