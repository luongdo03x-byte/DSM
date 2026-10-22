import type {ChannelSnapshot,SocialAccount} from '../../../../../packages/shared/src/domain.ts';
import type {Repositories} from '../../../../../packages/shared/src/repositories.ts';
import {growthOverWindow,byPillar} from '../../../../../packages/shared/src/growth/growth.ts';
import {cadence} from '../../../../../packages/shared/src/growth/goals.ts';
import {healthScore} from '../../../../../packages/shared/src/growth/health-score.ts';
import {bestTimes} from '../../../../../packages/shared/src/growth/best-time.ts';
import {MONETIZATION_PROGRAMS,monetizationProgress} from '../../../../../packages/shared/src/growth/monetization.ts';
import {vnEvents} from '../../../../../packages/shared/src/growth/vn-calendar.ts';

export class GrowthService{
  private readonly repos:Repositories;private readonly clock:()=>number;
  constructor(repos:Repositories,now:()=>number=Date.now){this.repos=repos;this.clock=now}
  async overview(brandId:string,days=28,year?:number){
    if(!Number.isInteger(days)||days<1||days>365)throw new Error('GROWTH_WINDOW_INVALID');
    const brand=await this.repos.brands.get(brandId);if(!brand)throw new Error('BRAND_NOT_FOUND');
    const accounts=(await this.repos.socialAccounts.findBy({brandId})).sort((a,b)=>a.platform.localeCompare(b.platform)||a.id.localeCompare(b.id));
    const eventYear=year??Number(new Intl.DateTimeFormat('en-US',{timeZone:brand.timezone,year:'numeric'}).format(this.clock()));if(!Number.isInteger(eventYear)||eventYear<2000||eventYear>2100)throw new Error('VN_CALENDAR_YEAR_INVALID');
    const accountsGrowth=[];for(const account of accounts)accountsGrowth.push(await this.account(brandId,account.id,this.clock(),days));
    const competitors=await this.repos.competitors.findBy({brandId});
    const competitorRows=[];for(const competitor of competitors){const rows=await this.repos.competitorSnapshots.findBy({competitorId:competitor.id});const latest=rows.sort((a,b)=>b.day.localeCompare(a.day))[0];competitorRows.push({competitor,...(latest?{latest}:{})})}
    const linkRows=await this.repos.trackedLinks.findBy({brandId}),clickEvents=await this.repos.clickEvents.findBy({});
    return{brandId,days,accounts:accountsGrowth,pillars:accountsGrowth.flatMap(item=>item.pillars),competitors:competitorRows,trackedLinks:{links:linkRows.length,clicks:clickEvents.filter(event=>linkRows.some(link=>link.id===event.trackedLinkId)).length},vnEvents:vnEvents(eventYear)};
  }
  async account(brandId:string,accountId:string,now=this.clock(),days=28){
    if(!Number.isInteger(days)||days<1||days>365)throw new Error('GROWTH_WINDOW_INVALID');
    const [account,brand]=await Promise.all([this.repos.socialAccounts.get(accountId),this.repos.brands.get(brandId)]);if(!account||account.brandId!==brandId)throw new Error('ACCOUNT_NOT_FOUND');if(!brand)throw new Error('BRAND_NOT_FOUND');
    const [snapshots,goal,posts,allMetrics,jobs]=await Promise.all([this.repos.channelSnapshots.findBy({socialAccountId:accountId}),this.repos.channelGoals.findBy({socialAccountId:accountId}),this.repos.publishedPosts.findBy({socialAccountId:accountId}),this.repos.postMetrics.findBy({}),this.repos.publishJobs.findBy({socialAccountId:accountId})]);
    const ordered=[...snapshots].sort((a,b)=>a.day.localeCompare(b.day)),latest=ordered.at(-1),growth=growthOverWindow(ordered,days),recentPosts=posts.filter(post=>post.publishedAt<=now&&post.publishedAt>=now-90*86_400_000),goalRow=goal[0],growthSufficient=!('insufficientData' in growth);
    const windowStart=now-days*86_400_000,windowMetrics=ordered.filter(row=>row.capturedAt>=windowStart&&row.capturedAt<=now),views=windowMetrics.every(row=>row.views!==null)?windowMetrics.reduce((sum,row)=>sum+(row.views??0),0):null,engagements=windowMetrics.every(row=>row.engagements!==null)?windowMetrics.reduce((sum,row)=>sum+(row.engagements??0),0):null;
    const engagementRate=views!==null&&engagements!==null&&views>0?engagements/views:null;
    const postIds=new Set(recentPosts.map(post=>post.id)),metricByPost=new Map<string,typeof allMetrics[number]>();
    for(const metric of allMetrics.filter(row=>postIds.has(row.publishedPostId)).sort((a,b)=>a.capturedAt-b.capturedAt))metricByPost.set(metric.publishedPostId,metric);
    const twentyFourHourMetric=new Map<string,typeof allMetrics[number]>();
    for(const metric of allMetrics.filter(row=>postIds.has(row.publishedPostId))){const post=recentPosts.find(item=>item.id===metric.publishedPostId);if(!post)continue;const age=metric.capturedAt-post.publishedAt;if(age<23*60*60_000||age>25*60*60_000)continue;const current=twentyFourHourMetric.get(post.id);if(!current||Math.abs(age-24*60*60_000)<Math.abs(current.capturedAt-post.publishedAt-24*60*60_000))twentyFourHourMetric.set(post.id,metric)}
    const postsForTimes=recentPosts.map(post=>{const metric=twentyFourHourMetric.get(post.id),postDay=new Intl.DateTimeFormat('en-CA',{timeZone:brand.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(post.publishedAt),snapshot=ordered.find(row=>row.day===postDay);return{publishedAt:post.publishedAt,views24h:metric?.views??null,followersAtPost:snapshot?.followers??null}});
    const profiles={hasAvatar:null,hasBio:null,hasLink:null};
    const successJobs=jobs.filter(job=>job.status==='PUBLISHED'||job.status==='FAILED'),successRate=successJobs.length?successJobs.filter(job=>job.status==='PUBLISHED').length/successJobs.length:null;
    const postCadence=cadence(posts.map(post=>post.publishedAt),goalRow,now,brand.timezone);
    const health=healthScore({profile:profiles,cadence:postCadence,growth,engagementRate,successRate});
    const contentItems=await this.repos.contents.findBy({brandId}),variants=await this.repos.variants.findBy({}),variantById=new Map(variants.map(row=>[row.id,row])),contentById=new Map(contentItems.map(row=>[row.id,row]));
    const pillars=byPillar(recentPosts.map(post=>{const variant=variantById.get(post.contentVariantId),content=variant?contentById.get(variant.contentItemId):undefined,metric=metricByPost.get(post.id);return{...(content?.pillarId?{pillarId:content.pillarId}:{}),views:metric?.views??null,engagements:metric&&metric.likes!==undefined&&metric.comments!==undefined?metric.likes+metric.comments+(metric.shares??0):null}}));
    const monetization=MONETIZATION_PROGRAMS.filter(program=>program.platform===account.platform).map(program=>({programId:program.id,note:program.note,...monetizationProgress(program.id,{followers:latest?.followers??null,subscribers:latest?.followers??null},new Date(now).toISOString().slice(0,10))}));
    const source=latest?.source??'UNAVAILABLE',capturedAt=latest?.capturedAt??null,windowSource=[...new Set(windowMetrics.map(row=>row.source))].join(',')||'UNAVAILABLE',windowCapturedAt=windowMetrics.reduce<number|null>((max,row)=>max===null?row.capturedAt:Math.max(max,row.capturedAt),null),baseline=latest?ordered.find(row=>row.day===new Intl.DateTimeFormat('en-CA',{timeZone:brand.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(now-days*86_400_000)):undefined,deltaSource=[...new Set([baseline?.source,latest?.source].filter((value):value is string=>Boolean(value)))].join(',')||'UNAVAILABLE',postSource='DSM:published_posts',bestTimesResult=bestTimes(postsForTimes,brand.timezone,now),bestTimeCapturedAt=postsForTimes.reduce<number|null>((max,post)=>{const metric=recentPosts.find(row=>row.publishedAt===post.publishedAt),captured=metric?metricByPost.get(metric.id)?.capturedAt:null;return captured===undefined||captured===null?max:max===null?captured:Math.max(max,captured)},null);
    return{account,metrics:{followers:{value:latest?.followers??null,source,capturedAt},views:{value:growthSufficient?growth.viewsSum:null,source:windowSource,capturedAt:windowCapturedAt},engagements:{value:engagements,source:windowSource,capturedAt:windowCapturedAt},followersDelta:{value:growthSufficient?growth.followersDelta:null,source:deltaSource,capturedAt},posts28:{value:postCadence.posts28,source:postSource,capturedAt:now},healthScore:{value:health.score,source:'DSM:healthScore',capturedAt},bestTimes:{value:bestTimesResult,source:'DSM:post_metrics+channel_snapshots',capturedAt:bestTimeCapturedAt}},growth,posts28:postCadence,health,bestTimes:bestTimesResult,pillars,monetization};
  }
}

