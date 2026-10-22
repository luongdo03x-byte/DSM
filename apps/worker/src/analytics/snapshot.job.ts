import {createHash} from 'node:crypto';
import type {Platform} from '../../../../packages/shared/src/domain.ts';
import type {Repositories} from '../../../../packages/shared/src/repositories.ts';
import type {InsightsSource} from '../../../../packages/platform-contracts/src/insights.ts';

export const SNAPSHOT_HOUR=2;
export const SNAPSHOT_QUEUE='dsm-analytics-snapshot';
type SnapshotScheduler={upsertJobScheduler(id:string,repeat:{pattern:string;tz:string},template:{name:string;data:{brandId:string};opts:{removeOnComplete:number;removeOnFail:number}}):Promise<unknown>};
export async function scheduleBrandSnapshots(repos:Repositories,queue:SnapshotScheduler):Promise<number>{
  const brands=(await repos.brands.findBy({status:'ACTIVE'})).sort((a,b)=>a.id.localeCompare(b.id));
  for(const brand of brands)await queue.upsertJobScheduler(`analytics:snapshot:${brand.id}`,{pattern:'0 2 * * *',tz:brand.timezone},{name:'analytics:snapshot',data:{brandId:brand.id},opts:{removeOnComplete:1000,removeOnFail:5000}});
  return brands.length;
}
const supported=new Set<Platform>(['FACEBOOK','INSTAGRAM','TIKTOK','YOUTUBE']);
export const localDay=(at:number,timeZone:string):string=>new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).format(at);
const plusDays=(day:string,offset:number):string=>new Date(Date.parse(day+'T00:00:00Z')+offset*86_400_000).toISOString().slice(0,10);
const snapshotId=(accountId:string,day:string)=>'snapshot-'+createHash('sha256').update(`${accountId}:${day}`).digest('hex').slice(0,32);

export async function runDailySnapshots(deps:{repos:Repositories;sources:Partial<Record<Platform,InsightsSource>>;now:number;brandId?:string}):Promise<{accounts:number;written:number;failed:{socialAccountId:string;code:string}[]}>{
  const {repos,now}=deps,accounts=(await repos.socialAccounts.findBy({status:'CONNECTED'})).filter(account=>supported.has(account.platform)&&(!deps.brandId||account.brandId===deps.brandId));
  const failed:{socialAccountId:string;code:string}[]=[];let written=0;
  for(const account of accounts){
    try{
      const source=deps.sources[account.platform];if(!source)throw Object.assign(new Error('INSIGHTS_SOURCE_UNAVAILABLE'),{code:'INSIGHTS_SOURCE_UNAVAILABLE'});
      const brand=await repos.brands.get(account.brandId);if(!brand)throw Object.assign(new Error('BRAND_NOT_FOUND'),{code:'BRAND_NOT_FOUND'});if(brand.status!=='ACTIVE')continue;
      const day=localDay(now,brand.timezone),prior=await repos.channelSnapshots.findBy({socialAccountId:account.id}),from=plusDays(day,prior.length? -1:-28);
      const points=await source.fetchAccountDaily(account,from,day,brand.timezone);
      for(const point of points){if(point.day<from||point.day>day)continue;
        const row={id:snapshotId(account.id,point.day),socialAccountId:account.id,...point,capturedAt:now};
        const existing=prior.find(snapshot=>snapshot.day===point.day);
        if(existing)await repos.channelSnapshots.update(existing.id,row);
        else try{await repos.channelSnapshots.insert(row)}catch(error){if((error as Error).message!=='DUPLICATE_ID')throw error;const raced=(await repos.channelSnapshots.findBy({socialAccountId:account.id,day:point.day}))[0];if(!raced)throw error;await repos.channelSnapshots.update(raced.id,row)}
        written++;
      }
      const posts=(await repos.publishedPosts.findBy({socialAccountId:account.id})).filter(post=>post.publishedAt>=now-90*86_400_000);
      for(const post of posts){
        const captureKey=`day:${day}`;
        if((await repos.postMetrics.findBy({publishedPostId:post.id,captureKey})).length)continue;
        try{const metrics=await source.fetchPostMetrics(account,post.platformPostId);await repos.postMetrics.append({id:'postmetric-'+createHash('sha256').update(`${post.id}:${captureKey}`).digest('hex').slice(0,32),publishedPostId:post.id,captureKey,capturedAt:now,...(metrics.views!==undefined?{views:metrics.views}:{}),...(metrics.likes!==undefined?{likes:metrics.likes}:{}),...(metrics.comments!==undefined?{comments:metrics.comments}:{}),...(metrics.shares!==undefined?{shares:metrics.shares}:{}),...(metrics.saves!==undefined?{saves:metrics.saves}:{}),rawMetrics:metrics.raw})}
        catch(error){if((error as Error).message!=='DUPLICATE_ID')failed.push({socialAccountId:account.id,code:String((error as {code?:string}).code??'POST_METRICS_FAILED')})}
      }
    }catch(error){failed.push({socialAccountId:account.id,code:String((error as {code?:string}).code??(error as Error).message??'INSIGHTS_FAILED')})}
  }
  return{accounts:accounts.length,written,failed};
}
