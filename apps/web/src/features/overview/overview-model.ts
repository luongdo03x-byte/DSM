import {platformLabel,statusLabel} from '../../lib/ui/status.ts';

export type AnalyticsSnapshot={posts?:number|null|undefined;views?:number|null|undefined;clicks?:number|null|undefined;ctr?:number|null|undefined;platforms?:Array<{platform:string;posts?:number|null|undefined;views?:number|null|undefined;clicks?:number|null|undefined;ctr?:number|null|undefined}>|undefined};
export type AccountSnapshot={id:string;platform?:string;username?:string;status?:string;publishMode?:string;browserProfileId?:string};
export type JobSnapshot={id:string;platform?:string;status?:string;scheduledAt?:number;errorMessage?:string;errorCode?:string};

function count(value:unknown){return typeof value==='number'&&Number.isFinite(value)&&value>0?Math.floor(value):0}
function dayBounds(timestamp:number){const d=new Date(timestamp);d.setHours(0,0,0,0);return{start:d.getTime(),end:d.getTime()+86_400_000}}

export function buildOverviewModel(input:{analytics?:AnalyticsSnapshot|null;accounts?:AccountSnapshot[]|null;jobs?:JobSnapshot[]|null},now=Date.now()){
  const analytics=input.analytics??{};
  const accounts=Array.isArray(input.accounts)?input.accounts:[];
  const jobs=Array.isArray(input.jobs)?input.jobs:[];
  const bounds=dayBounds(now);
  const sorted=[...jobs].sort((a,b)=>(b.scheduledAt??0)-(a.scheduledAt??0));
  return {
    kpis:{
      publishedPosts:count(analytics.posts),
      views:count(analytics.views),
      clicks:count(analytics.clicks),
      scheduledJobs:jobs.filter(job=>job.status==='QUEUED').length,
      failedJobs:jobs.filter(job=>job.status==='FAILED').length,
      activeAccounts:accounts.filter(account=>account.status==='CONNECTED').length
    },
    platforms:(analytics.platforms??[]).map(row=>({platform:platformLabel(row.platform),posts:count(row.posts),views:count(row.views),clicks:count(row.clicks),ctr:typeof row.ctr==='number'&&Number.isFinite(row.ctr)&&row.ctr>=0?row.ctr:null})),
    accountHealth:accounts.map(account=>({
      id:account.id,
      platform:platformLabel(account.platform),
      username:account.username??'Chưa đặt tên',
      status:statusLabel(account.status),
      connected:account.status==='CONNECTED',
      mode:account.publishMode==='BROWSER'?'Trình duyệt':account.publishMode==='HYBRID'?'Kết hợp':'API',
      warning:(account.publishMode==='BROWSER'||account.publishMode==='HYBRID')&&!account.browserProfileId
    })),
    recentJobs:sorted.slice(0,6).map(job=>({...job,platform:platformLabel(job.platform),statusLabel:statusLabel(job.status)})),
    todaySchedule:jobs.filter(job=>typeof job.scheduledAt==='number'&&job.scheduledAt>=bounds.start&&job.scheduledAt<bounds.end).sort((a,b)=>(a.scheduledAt??0)-(b.scheduledAt??0)).slice(0,6).map(job=>({...job,platform:platformLabel(job.platform),statusLabel:statusLabel(job.status)}))
  };
}
