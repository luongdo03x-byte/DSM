import type {Platform} from '../domain.ts';

export type MonetizationMetric='subscribers'|'publicUploads90d'|'publicWatchHours12m'|'shortsViews90d'|'followers'|'views30d';
export type MonetizationProgram={id:string;platform:Platform;validFrom:string;requirements:{metric:MonetizationMetric;min:number}[][];note?:string};

// Numeric milestones are progress indicators; account policy, country and review remain platform decisions.
export const MONETIZATION_PROGRAMS:MonetizationProgram[]=[
  {id:'youtube-early',platform:'YOUTUBE',validFrom:'2026-10-21',requirements:[[{metric:'subscribers',min:500},{metric:'publicUploads90d',min:3},{metric:'publicWatchHours12m',min:3000}],[{metric:'subscribers',min:500},{metric:'publicUploads90d',min:3},{metric:'shortsViews90d',min:3_000_000}]],note:'Fan funding/Shopping: còn cần điều kiện quốc gia, chính sách và xét duyệt của YouTube.'},
  {id:'youtube-ads',platform:'YOUTUBE',validFrom:'2026-10-21',requirements:[[{metric:'subscribers',min:1000},{metric:'publicWatchHours12m',min:4000}],[{metric:'subscribers',min:1000},{metric:'shortsViews90d',min:10_000_000}]],note:'Chỉ giờ xem và lượt xem Shorts đủ chuẩn của YouTube được tính; còn cần xét duyệt.'},
  {id:'tiktok-rewards',platform:'TIKTOK',validFrom:'2026-10-21',requirements:[[{metric:'followers',min:10_000},{metric:'views30d',min:100_000}]],note:'Còn cần tài khoản cá nhân, từ 18 tuổi, video nguyên gốc dài hơn 1 phút, quốc gia được hỗ trợ; chưa xác nhận Việt Nam.'},
  {id:'facebook-business-suite',platform:'FACEBOOK',validFrom:'2026-10-21',requirements:[],note:'Kiểm tra điều kiện trong Meta Business Suite.'},
];

export function monetizationProgress(programId:string,facts:Record<string,number|null>,onDay:string,programs:MonetizationProgram[]=MONETIZATION_PROGRAMS):{groups:{met:boolean;items:{metric:string;value:number|null;min:number;pct:number|null}[]}[];eta?:string}{
  const program=programs.filter(row=>row.id===programId&&row.validFrom<=onDay).sort((a,b)=>b.validFrom.localeCompare(a.validFrom))[0];
  if(!program)throw new Error('MONETIZATION_PROGRAM_VERSION_UNAVAILABLE');
  return{groups:program.requirements.map(group=>{const items=group.map(item=>{const value=facts[item.metric]??null;return{metric:item.metric,value,min:item.min,pct:value===null?null:Math.max(0,Math.min(1,value/item.min))}});return{met:items.every(item=>item.value!==null&&item.value>=item.min),items}})};
}
