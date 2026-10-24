import type {ContentItem,ContentType} from '../../../../../packages/shared/src/domain.ts';
import type {Repositories} from '../../../../../packages/shared/src/repositories.ts';
import {MEDIA_RULES} from '../../../../../packages/shared/src/media-rules.ts';
import {vnEvents} from '../../../../../packages/shared/src/growth/vn-calendar.ts';
import {byPillar} from '../../../../../packages/shared/src/growth/growth.ts';
import {id} from '../../../../../packages/shared/src/ids.ts';
import {PlanSchema} from './schemas.ts';
import type {AiService} from './ai.service.ts';

const DAY=86_400_000;
function parseDay(value:string){if(!/^\d{4}-\d{2}-\d{2}$/.test(value))throw new Error('INVALID_PLAN_DATE');const ms=Date.parse(value+'T00:00:00Z');if(!Number.isFinite(ms)||new Date(ms).toISOString().slice(0,10)!==value)throw new Error('INVALID_PLAN_DATE');return ms}
function localDay(ms:number,timeZone:string){const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(ms).map(part=>[part.type,part.value]));return`${parts.year}-${parts.month}-${parts.day}`}
function localNoon(date:string,timeZone:string){let guess=parseDay(date)+12*3_600_000;const wanted=parseDay(date)+12*3_600_000;for(let i=0;i<4;i++){const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(guess).map(part=>[part.type,part.value]));const actual=Date.UTC(Number(parts.year),Number(parts.month)-1,Number(parts.day),Number(parts.hour),Number(parts.minute));const delta=wanted-actual;if(delta===0)return guess;guess+=delta}throw new Error('INVALID_PLAN_DATE')}
function contentType(format:string):ContentType{return format==='IMAGE'?'IMAGE':format==='ALBUM'?'ALBUM':['VIDEO','REEL','STORY','SHORT'].includes(format)?'VIDEO':'TEXT'}

export class ContentPlanService{
  private readonly repos:Repositories;
  private readonly ai:Pick<AiService,'run'>;
  constructor(repos:Repositories,ai:Pick<AiService,'run'>){this.repos=repos;this.ai=ai}
  async generate(brandId:string,startDate:string,accountIds:string[]):Promise<{created:ContentItem[];skipped:{date:string;socialAccountId:string;reason:'ALREADY_SCHEDULED'}[];issues:{code:string;message:string}[]}>{
    const start=parseDay(startDate),last=start+29*DAY,brand=await this.repos.brands.get(brandId);
    if(!brand)throw new Error('BRAND_NOT_FOUND');
    if(!accountIds.length||new Set(accountIds).size!==accountIds.length)throw new Error('INVALID_AI_REQUEST');
    const accounts=await Promise.all(accountIds.map(accountId=>this.repos.socialAccounts.get(accountId)));
    if(accounts.some(account=>!account||account.brandId!==brandId))throw new Error('ACCOUNT_NOT_FOUND');
    const pillars=await this.repos.contentPillars.findBy({brandId});
    if(!pillars.length)throw new Error('PLAN_PILLARS_REQUIRED');
    const goals=await Promise.all(accountIds.map(accountId=>this.repos.channelGoals.findBy({socialAccountId:accountId})));
    const counts=Object.fromEntries(accountIds.map((accountId,index)=>[accountId,Math.max(1,Math.round((goals[index]?.[0]?.postsPer28Days??8)*30/28))]));
    const events=[...new Set([new Date(start).getUTCFullYear(),new Date(last).getUTCFullYear()])].flatMap(vnEvents).filter(event=>parseDay(event.date)>=start&&parseDay(event.date)<=last);
    const posts=await this.repos.publishedPosts.findBy({brandId}),contents=await this.repos.contents.findBy({brandId}),variants=await this.repos.variants.findBy({});
    const contentById=new Map(contents.map(content=>[content.id,content])),variantById=new Map(variants.map(variant=>[variant.id,variant]));
    const performance=byPillar(await Promise.all(posts.filter(post=>post.publishedAt>=Date.now()-90*DAY).map(async post=>{const content=contentById.get(variantById.get(post.contentVariantId)?.contentItemId??'');const metrics=await this.repos.postMetrics.findBy({publishedPostId:post.id});const latest=metrics.sort((a,b)=>b.capturedAt-a.capturedAt)[0];return{...(content?.pillarId?{pillarId:content.pillarId}:{}),views:latest?.views??null,engagements:latest?.likes!==undefined&&latest?.comments!==undefined?latest.likes+latest.comments+(latest.shares??0):null}})));
    const prompt=JSON.stringify({task:'Đề xuất kế hoạch 30 ngày tiếng Việt. Trả ý tưởng theo từng kênh, pillar và mục tiêu; không tạo bài đăng.',startDate,days:30,accounts:accounts.map((account,index)=>({id:account!.id,platform:account!.platform,targetPosts:counts[account!.id]})),pillars:pillars.map(pillar=>({id:pillar.id,name:pillar.name,description:pillar.description})),events,performance});
    const {data}=await this.ai.run('PLAN_30D',brandId,PlanSchema,prompt,{stream:true});
    const jobs=await this.repos.publishJobs.findBy({brandId}),occupied=new Set<string>(),scheduledPlans=new Set<string>();
    for(const job of jobs.filter(job=>!['CANCELLED','FAILED'].includes(job.status))){
      occupied.add(`${job.socialAccountId}|${localDay(job.publishAt??job.scheduledAt,brand.timezone)}`);
      const batch=await this.repos.publishBatches.get(job.batchId);
      if(batch)scheduledPlans.add(`${batch.contentItemId}|${job.socialAccountId}`);
    }
    for(const content of contents)if(content.plannedAt&&content.plannedSocialAccountId&&content.status!=='ARCHIVED'&&!scheduledPlans.has(`${content.id}|${content.plannedSocialAccountId}`))occupied.add(`${content.plannedSocialAccountId}|${localDay(content.plannedAt,brand.timezone)}`);
    const validPillars=new Set(pillars.map(pillar=>pillar.id)),validAccounts=new Set(accountIds),created:ContentItem[]=[],skipped:{date:string;socialAccountId:string;reason:'ALREADY_SCHEDULED'}[]=[],issues:{code:string;message:string}[]=[];
    const used=new Map<string,number>();
    for(const item of data.items.sort((a,b)=>a.date.localeCompare(b.date)||a.socialAccountId.localeCompare(b.socialAccountId))){
      let day:number;try{day=parseDay(item.date)}catch{issues.push({code:'PLAN_DATE_INVALID',message:'Đã bỏ ý tưởng có ngày không hợp lệ.'});continue}
      if(day<start||day>last||!validAccounts.has(item.socialAccountId)||!validPillars.has(item.pillarId)){issues.push({code:'PLAN_ITEM_OUT_OF_SCOPE',message:'Đã bỏ ý tưởng ngoài phạm vi kế hoạch.'});continue}
      const account=accounts[accountIds.indexOf(item.socialAccountId)]!;
      if(!MEDIA_RULES[account.platform].formats.includes(item.format)){issues.push({code:'PLAN_FORMAT_UNSUPPORTED',message:'Đã bỏ định dạng không hợp với kênh.'});continue}
      const key=`${item.socialAccountId}|${item.date}`;
      if(occupied.has(key)){skipped.push({date:item.date,socialAccountId:item.socialAccountId,reason:'ALREADY_SCHEDULED'});continue}
      if((used.get(item.socialAccountId)??0)>=counts[item.socialAccountId]!){issues.push({code:'PLAN_CADENCE_LIMIT',message:'Đã cắt ý tưởng vượt tần suất mục tiêu.'});continue}
      const eventName=events.find(event=>event.date===item.date)?.name;
      const draft:ContentItem={id:id('content'),brandId,pillarId:item.pillarId,type:contentType(item.format),title:item.idea,hook:item.hook,status:'DRAFT',plannedAt:localNoon(item.date,brand.timezone),plannedSocialAccountId:item.socialAccountId,...(eventName?{plannedEventName:eventName}:{})};
      await this.repos.transaction(async tx=>{await tx.contents.insert(draft);await tx.variants.insert({id:id('variant'),contentItemId:draft.id,socialAccountId:item.socialAccountId,platform:account.platform,format:item.format,hashtags:[],status:'DRAFT'})});
      created.push(draft);occupied.add(key);used.set(item.socialAccountId,(used.get(item.socialAccountId)??0)+1);
    }
    return{created,skipped,issues};
  }
}
