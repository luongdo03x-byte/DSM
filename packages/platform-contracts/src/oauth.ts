import type {Platform} from '../../shared/src/domain.ts';

export interface OAuthTokens {accessToken:string;refreshToken?:string;expiresAt?:number;scopes:string[]}
export interface ConnectableAccount {platformAccountId:string;platform:Platform;displayName:string;username?:string;pictureUrl?:string;providerUserId?:string;tokens:OAuthTokens}
export interface OAuthConnector {
  readonly provider:'META'|'TIKTOK'|'GOOGLE';
  authorizeUrl(state:string,redirectUri:string):string;
  exchangeCode(code:string,redirectUri:string):Promise<OAuthTokens>;
  listAccounts(tokens:OAuthTokens):Promise<ConnectableAccount[]>;
}
