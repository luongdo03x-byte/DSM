import type {SocialAccount} from '../../shared/src/domain.ts';
import type {PostMetricsData} from './index.ts';

export interface AccountMetricPoint {
  day:string;
  followers:number|null;
  views:number|null;
  reach:number|null;
  engagements:number|null;
  profileViews:number|null;
  watchTimeMinutes:number|null;
  source:string;
  raw:Record<string,unknown>;
}
export interface ProfileFacts {hasAvatar:boolean|null;hasBio:boolean|null;hasLink:boolean|null}
export interface InsightsSource {
  fetchAccountDaily(account:SocialAccount,fromDay:string,toDay:string,timeZone:string):Promise<AccountMetricPoint[]>;
  fetchProfile(account:SocialAccount):Promise<ProfileFacts>;
  fetchPostMetrics(account:SocialAccount,platformPostId:string):Promise<PostMetricsData>;
}
