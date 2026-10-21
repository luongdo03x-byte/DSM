import {PublishError} from '../../../../packages/platform-contracts/src/index.ts';
import type {AccountMetricPoint} from '../../../../packages/platform-contracts/src/insights.ts';

export const metricNumber=(value:unknown):number|null=>typeof value==='number'&&Number.isFinite(value)?value:typeof value==='string'&&value.trim()!==''&&Number.isFinite(Number(value))?Number(value):null;
export const present=(value:unknown):boolean|null=>value===undefined||value===null?null:typeof value==='string'?value.trim().length>0:typeof value==='boolean'?value:Boolean(value);
export const brandDay=(timeZone:string,at=Date.now()):string=>new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).format(at);
export const nextDay=(day:string):string=>new Date(Date.parse(day+'T00:00:00Z')+86_400_000).toISOString().slice(0,10);
export function withCurrentFollowers(rows:AccountMetricPoint[],fromDay:string,toDay:string,timeZone:string,followers:number|null,source:string):AccountMetricPoint[]{
  const day=brandDay(timeZone);if(day<fromDay||day>toDay)return rows;
  const existing=rows.find(row=>row.day===day);if(existing){existing.followers=followers;existing.raw={...existing.raw,currentFollowers:followers};return rows}
  return [...rows,{day,followers,views:null,reach:null,engagements:null,profileViews:null,watchTimeMinutes:null,source,raw:{currentFollowers:followers}}].sort((a,b)=>a.day.localeCompare(b.day));
}
export function insightsError(error:unknown):never{
  if(error instanceof PublishError&&(error.type==='AUTH_ERROR'||error.code==='10'||error.code==='403'||error.code==='scope_not_authorized'))throw new PublishError({type:'AUTH_ERROR',code:'INSIGHTS_PERMISSION_MISSING',message:'Cần cấp thêm quyền xem số liệu',retryable:false});
  throw error;
}
type Metric={name:string;values?:Array<{end_time?:string;value?:unknown}>;value?:unknown};
export function metaDaily(data:{data?:Metric[]},fromDay:string,toDay:string,source:string,names:{views:string;reach?:string;engagements?:string;profileViews?:string}):AccountMetricPoint[]{
  const byDay=new Map<string,Record<string,unknown>>();
  for(const metric of data.data??[])for(const point of metric.values??[]){const end=point.end_time?.slice(0,10);if(!end)continue;const day=new Date(Date.parse(end+'T00:00:00Z')-86_400_000).toISOString().slice(0,10);if(day<fromDay||day>toDay)continue;byDay.set(day,{...byDay.get(day),[metric.name]:point.value});}
  return [...byDay].sort(([a],[b])=>a.localeCompare(b)).map(([day,raw])=>({day,followers:null,views:metricNumber(raw[names.views]),reach:names.reach?metricNumber(raw[names.reach]):null,engagements:names.engagements?metricNumber(raw[names.engagements]):null,profileViews:names.profileViews?metricNumber(raw[names.profileViews]):null,watchTimeMinutes:null,source,raw}));
}
