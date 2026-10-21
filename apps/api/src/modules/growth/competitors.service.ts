import {createHash} from 'node:crypto';
import type {Competitor,CompetitorSnapshot,Platform,SocialAccount} from '../../../../../packages/shared/src/domain.ts';
import type {Repositories} from '../../../../../packages/shared/src/repositories.ts';
import type {HttpClient} from '../../../../../packages/shared/src/http.ts';
import type {MetaGraphClient} from '../../integrations/meta/meta-http.client.ts';
import {metricNumber} from '../../integrations/insights-helpers.ts';

const dayAt=(now:number,timeZone:string)=>new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
const key=(prefix:string,value:string)=>prefix+'-'+createHash('sha256').update(value).digest('hex').slice(0,32);
export class CompetitorsService {
  private readonly repos:Repositories;private readonly graph:MetaGraphClient|undefined;private readonly youtubeHttp:HttpClient|undefined;private readonly tokens:(accountId:string)=>Promise<string>;private readonly now:()=>number;private readonly youtubeBaseUrl:string;
  constructor(deps:{repos:Repositories;graph?:MetaGraphClient;youtubeHttp?:HttpClient;tokens:(accountId:string)=>Promise<string>;now?:()=>number;youtubeBaseUrl?:string}){this.repos=deps.repos;this.graph=deps.graph;this.youtubeHttp=deps.youtubeHttp;this.tokens=deps.tokens;this.now=deps.now??Date.now;this.youtubeBaseUrl=deps.youtubeBaseUrl??'https://www.googleapis.com'}
  async add(brandId:string,input:{platform:Platform;handle:string}):Promise<Competitor>{
    if(!await this.repos.brands.get(brandId))throw new Error('BRAND_NOT_FOUND');
    if(!['FACEBOOK','INSTAGRAM','TIKTOK','YOUTUBE'].includes(input.platform))throw new Error('COMPETITOR_PLATFORM_UNSUPPORTED');
    const handle=input.handle.trim().replace(/^@/,'').toLowerCase();if(!/^[a-z0-9._-]{1,100}$/.test(handle))throw new Error('COMPETITOR_HANDLE_INVALID');
    const source=input.platform==='INSTAGRAM'||input.platform==='YOUTUBE'?'API':'MANUAL';
    const existing=(await this.repos.competitors.findBy({brandId,platform:input.platform,handle}))[0];if(existing)return existing;
    return this.repos.competitors.insert({id:key('competitor',`${brandId}:${input.platform}:${handle}`),brandId,platform:input.platform,handle,source});
  }
  async list(brandId:string):Promise<Competitor[]>{return this.repos.competitors.findBy({brandId})}
  private async ownedAccount(competitor:Competitor):Promise<SocialAccount>{const account=(await this.repos.socialAccounts.findBy({brandId:competitor.brandId,platform:competitor.platform,status:'CONNECTED'}))[0];if(!account)throw new Error('COMPETITOR_OWN_ACCOUNT_REQUIRED');return account}
  private async save(competitor:Competitor,metrics:{followers:number|null;posts:number|null;source:string;raw?:Record<string,unknown>}):Promise<CompetitorSnapshot>{
    const brand=await this.repos.brands.get(competitor.brandId);if(!brand)throw new Error('BRAND_NOT_FOUND');const capturedAt=this.now(),day=dayAt(capturedAt,brand.timezone),row:CompetitorSnapshot={id:key('comp-snapshot',`${competitor.id}:${day}`),competitorId:competitor.id,day,followers:metrics.followers,posts:metrics.posts,source:metrics.source,capturedAt,...(metrics.raw?{raw:metrics.raw}:{})};
    const existing=(await this.repos.competitorSnapshots.findBy({competitorId:competitor.id,day}))[0];return existing?this.repos.competitorSnapshots.update(existing.id,row):this.repos.competitorSnapshots.insert(row);
  }
  async capture(id:string):Promise<CompetitorSnapshot>{
    const competitor=await this.repos.competitors.get(id);if(!competitor)throw new Error('COMPETITOR_NOT_FOUND');if(competitor.source!=='API')throw new Error('COMPETITOR_MANUAL_ONLY');
    const account=await this.ownedAccount(competitor),token=await this.tokens(account.id);
    if(competitor.platform==='INSTAGRAM'){
      if(!this.graph)throw new Error('META_GRAPH_NOT_CONFIGURED');const owner=account.platformAccountId??account.id;
      const raw=await this.graph.get<{business_discovery?:{followers_count?:number;media_count?:number}}>(`/${owner}`,token,{fields:`business_discovery.username(${competitor.handle}){id,username,followers_count,media_count}`});
      return this.save(competitor,{followers:metricNumber(raw.business_discovery?.followers_count),posts:metricNumber(raw.business_discovery?.media_count),source:'INSTAGRAM:business_discovery',raw});
    }
    if(!this.youtubeHttp)throw new Error('YOUTUBE_HTTP_NOT_CONFIGURED');
    const url=new URL(`${this.youtubeBaseUrl}/youtube/v3/channels`);url.searchParams.set('part','statistics,snippet');url.searchParams.set('forHandle',`@${competitor.handle}`);
    const response=await this.youtubeHttp.request<{items?:Array<{statistics?:{subscriberCount?:string;videoCount?:string}}>}>({url:url.toString(),headers:{authorization:`Bearer ${token}`}});if(response.status>=400)throw new Error(`YOUTUBE_COMPETITOR_${response.status}`);
    const raw=response.data.items?.[0]??{};
    return this.save(competitor,{followers:metricNumber(raw.statistics?.subscriberCount),posts:metricNumber(raw.statistics?.videoCount),source:'YOUTUBE:channels.list',raw});
  }
  async captureManual(id:string,metrics:{followers:number|null;posts:number|null}):Promise<CompetitorSnapshot>{
    const competitor=await this.repos.competitors.get(id);if(!competitor)throw new Error('COMPETITOR_NOT_FOUND');if(competitor.source!=='MANUAL')throw new Error('COMPETITOR_API_ONLY');
    for(const value of [metrics.followers,metrics.posts])if(value!==null&&(!Number.isSafeInteger(value)||value<0))throw new Error('COMPETITOR_METRIC_INVALID');
    return this.save(competitor,{...metrics,source:'MANUAL'});
  }
}
