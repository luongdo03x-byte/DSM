import type {ChannelSnapshot} from '../domain.ts';

export type Insufficient={insufficientData:true;needed:string};
const dayOffset=(day:string,days:number)=>new Date(Date.parse(day+'T00:00:00Z')+days*86_400_000).toISOString().slice(0,10);
export const median=(values:number[]):number|null=>{if(!values.length)return null;const sorted=[...values].sort((a,b)=>a-b),middle=Math.floor(sorted.length/2);return sorted.length%2?sorted[middle]!:(sorted[middle-1]!+sorted[middle]!)/2};

export function growthOverWindow(snapshots:ChannelSnapshot[],days:number):{followersDelta:number;followersPct:number|null;viewsSum:number|null}|Insufficient{
  if(!Number.isInteger(days)||days<=0)throw new Error('GROWTH_WINDOW_INVALID');
  const sorted=[...snapshots].sort((a,b)=>a.day.localeCompare(b.day)),end=sorted.at(-1);
  if(!end)return{insufficientData:true,needed:`Cần dữ liệu đủ ${days} ngày`};
  const startDay=dayOffset(end.day,-days),start=sorted.find(row=>row.day===startDay);
  if(!start||start.followers===null||end.followers===null)return{insufficientData:true,needed:`Cần dữ liệu đủ ${days} ngày`};
  const followersDelta=end.followers-start.followers,followersPct=start.followers>0?followersDelta/start.followers:null;
  const windowRows=sorted.filter(row=>row.day>startDay&&row.day<=end.day),byDay=new Map(windowRows.map(row=>[row.day,row]));
  let viewsSum:number|null=0;
  for(let i=1;i<=days;i++){const row=byDay.get(dayOffset(startDay,i));if(!row||row.views===null){viewsSum=null;break}viewsSum+=row.views}
  return{followersDelta,followersPct,viewsSum};
}

export function byPillar(posts:{pillarId?:string;views:number|null;engagements:number|null}[]):{pillarId:string|'NONE';posts:number;medianViews:number|null;engagementRate:number|null}[]{
  const groups=new Map<string,typeof posts>();
  for(const post of posts){const key=post.pillarId||'NONE';groups.set(key,[...(groups.get(key)??[]),post])}
  return [...groups].sort(([a],[b])=>a.localeCompare(b)).map(([pillarId,rows])=>{
    const complete=rows.every(row=>row.views!==null&&row.engagements!==null),views=rows.reduce((sum,row)=>sum+(row.views??0),0),engagements=rows.reduce((sum,row)=>sum+(row.engagements??0),0);
    return{pillarId,posts:rows.length,medianViews:rows.every(row=>row.views!==null)?median(rows.map(row=>row.views!)):null,engagementRate:complete&&views>0?engagements/views:null};
  });
}
