import type {Platform,SocialAccount} from '../../shared/src/domain.ts';
import type {PlatformRule} from '../../shared/src/media-rules.ts';
import type {PlatformPublisher,PublishResult} from './index.ts';

export interface AdapterCapabilities {platform:Platform;rule:PlatformRule;dailyPublishLimit?:number}
export interface TokenRefreshResult {refreshed:boolean;expiresAt?:number}
export interface PlatformAdapter extends PlatformPublisher {
  readonly platform:Platform;
  capabilities(account:SocialAccount):AdapterCapabilities;
  pollStatus(input:{socialAccountId:string;remoteCorrelationId:string}):Promise<PublishResult>;
  refreshToken(account:SocialAccount):Promise<TokenRefreshResult>;
}
