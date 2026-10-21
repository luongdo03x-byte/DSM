import type {ProfileFacts} from '../../../platform-contracts/src/insights.ts';
import type {cadence} from './goals.ts';
import type {growthOverWindow} from './growth.ts';

type Key='profile'|'cadence'|'growth'|'engagement'|'reliability';
type Part={key:Key;points:number|null;max:number;note?:string};
const clamp=(value:number)=>Math.max(0,Math.min(1,value));
export function healthScore(input:{profile:ProfileFacts;cadence:ReturnType<typeof cadence>;growth:ReturnType<typeof growthOverWindow>;engagementRate:number|null;successRate:number|null}):{score:number|null;parts:Part[]}{
  const facts=[input.profile.hasAvatar,input.profile.hasBio,input.profile.hasLink],available=facts.filter(value=>value!==null),profileMax=available.length*5;
  const growthPct='insufficientData' in input.growth?null:input.growth.followersPct;
  const parts:Part[]=[
    {key:'profile',points:profileMax?available.filter(Boolean).length*5:null,max:profileMax,...(profileMax<15?{note:'Một số thông tin hồ sơ không được API cung cấp'}:{})},
    {key:'cadence',points:input.cadence.ratio===null?null:clamp(input.cadence.ratio)*30,max:30,...(input.cadence.ratio===null?{note:'Chưa đặt mục tiêu'}:{})},
    {key:'growth',points:growthPct===null?null:clamp(growthPct/0.05)*25,max:25,...(growthPct===null?{note:'Chưa đủ dữ liệu tăng trưởng'}:{})},
    {key:'engagement',points:input.engagementRate===null?null:clamp(input.engagementRate/0.05)*20,max:20,...(input.engagementRate===null?{note:'Chưa đủ dữ liệu tương tác'}:{})},
    {key:'reliability',points:input.successRate===null?null:clamp(input.successRate)*10,max:10,...(input.successRate===null?{note:'Chưa có lịch sử đăng'}:{})},
  ];
  const max=parts.reduce((total,part)=>total+(part.points===null?0:part.max),0),points=parts.reduce((total,part)=>total+(part.points??0),0);
  return{score:max?Math.round(points/max*100):null,parts};
}
