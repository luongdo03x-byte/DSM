import {median,type Insufficient} from './growth.ts';

export const BEST_TIME_MIN_POSTS=20;
type Post={publishedAt:number;views24h:number|null;followersAtPost:number|null};
type Slot={weekday:1|2|3|4|5|6|7;hour:number;score:number};
const weekdayIndex:{[key:string]:Slot['weekday']}={Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6,Sun:7};
export function bestTimes(posts:Post[],timeZone:string,now=Date.now()):{slots:Slot[]}|Insufficient{
  const recent=posts.filter(post=>post.publishedAt<=now&&post.publishedAt>=now-90*86_400_000);
  if(recent.length<BEST_TIME_MIN_POSTS)return{insufficientData:true,needed:`Cần thêm ${BEST_TIME_MIN_POSTS-recent.length} bài`};
  const formatter=new Intl.DateTimeFormat('en-US',{timeZone,weekday:'short',hour:'2-digit',hourCycle:'h23'}),groups=new Map<string,{weekday:Slot['weekday'];hour:number;values:number[]}>();
  for(const post of recent){if(post.views24h===null||post.followersAtPost===null||post.followersAtPost<=0)continue;
    const parts=formatter.formatToParts(post.publishedAt),weekday=weekdayIndex[parts.find(part=>part.type==='weekday')?.value??''],hour=Number(parts.find(part=>part.type==='hour')?.value);
    if(!weekday||!Number.isInteger(hour))continue;
    const key=`${weekday}:${hour}`,group=groups.get(key)??{weekday,hour,values:[]};group.values.push(post.views24h/post.followersAtPost);groups.set(key,group);
  }
  if(!groups.size)return{insufficientData:true,needed:'Cần dữ liệu lượt xem 24 giờ và người theo dõi'};
  const slots=[...groups.values()].map(group=>({weekday:group.weekday,hour:group.hour,score:median(group.values)!})).sort((a,b)=>b.score-a.score||a.weekday-b.weekday||a.hour-b.hour);
  return{slots};
}
