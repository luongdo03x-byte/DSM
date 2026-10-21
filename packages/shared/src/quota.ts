import type {Repositories} from './repositories.ts';
type Provider='YOUTUBE'|'INSTAGRAM';
const pacific=new Intl.DateTimeFormat('en-US',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
function parts(ms:number){return Object.fromEntries(pacific.formatToParts(ms).map(x=>[x.type,x.value])) as Record<string,string>}
export function pacificDayKey(ms:number):string{const p=parts(ms);return`${p.year}-${p.month}-${p.day}`}
export function nextPacificReset(ms:number):number{const [year,month,day]=pacificDayKey(ms).split('-').map(Number);const next=new Date(Date.UTC(year!,month!-1,day!+1));const nextKey=next.toISOString().slice(0,10);for(const hour of [7,8,9]){const candidate=Date.parse(`${nextKey}T${String(hour).padStart(2,'0')}:05:00Z`),p=parts(candidate);if(pacificDayKey(candidate)===nextKey&&p.hour==='00'&&p.minute==='05')return candidate}throw new Error('PACIFIC_RESET_NOT_FOUND')}
export class QuotaManager{
  private readonly repos:Repositories;private readonly now:()=>number;
  constructor(repos:Repositories,now:()=>number=Date.now){this.repos=repos;this.now=now}
  async tryConsume(provider:Provider,scope:string,limit:number):Promise<{ok:true}|{ok:false;retryAt:number}>{if(!scope||!Number.isInteger(limit)||limit<1)throw new Error('INVALID_QUOTA');const day=pacificDayKey(this.now()),id=`${provider}:${scope}:${day}`;return await this.repos.quotaUsage.tryConsume({id,provider,scope,day},limit)?{ok:true}:{ok:false,retryAt:nextPacificReset(this.now())}}
  async usage(provider:Provider,scope:string,limit=provider==='YOUTUBE'?100:25):Promise<{used:number;limit:number;resetsAt:number}>{const day=pacificDayKey(this.now()),row=await this.repos.quotaUsage.get(`${provider}:${scope}:${day}`);return{used:row?.used??0,limit,resetsAt:nextPacificReset(this.now())}}
}
