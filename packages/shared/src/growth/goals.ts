import type {ChannelGoal} from '../domain.ts';

const localDay=(timestamp:number,timeZone:string)=>new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).format(timestamp);
const minusDay=(day:string,days:number)=>new Date(Date.parse(day+'T00:00:00Z')-days*86_400_000).toISOString().slice(0,10);

export function cadence(postsAt:number[],goal:ChannelGoal|undefined,now:number,timeZone='UTC'):{posts28:number;target28:number|null;ratio:number|null;streakDays:number}{
  const recent=postsAt.filter(at=>at<=now&&at>now-28*86_400_000),target28=goal?.postsPer28Days&&goal.postsPer28Days>0?goal.postsPer28Days:null;
  const days=new Set(postsAt.filter(at=>at<=now).map(at=>localDay(at,timeZone))),today=localDay(now,timeZone),start=days.has(today)?today:minusDay(today,1);
  let streakDays=0;if(days.has(start))for(let i=0;days.has(minusDay(start,i));i++)streakDays++;
  return{posts28:recent.length,target28,ratio:target28===null?null:recent.length/target28,streakDays};
}
