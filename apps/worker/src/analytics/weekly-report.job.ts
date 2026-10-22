import type {Repositories} from '../../../../packages/shared/src/repositories.ts';
import type {NotificationDispatcher} from '../notifications/notification-dispatcher.ts';
import {GrowthService} from '../../../api/src/modules/growth/growth.service.ts';

export const WEEKLY_REPORT_QUEUE='dsm-weekly-growth-report';
type WeeklyScheduler={upsertJobScheduler(id:string,repeat:{pattern:string;tz:string},template:{name:string;data:{brandId:string};opts:{removeOnComplete:number;removeOnFail:number}}):Promise<unknown>};
export async function scheduleWeeklyReports(repos:Repositories,queue:WeeklyScheduler):Promise<number>{
  const brands=(await repos.brands.findBy({status:'ACTIVE'})).sort((a,b)=>a.id.localeCompare(b.id));
  for(const brand of brands)await queue.upsertJobScheduler('growth:weekly:'+brand.id,{pattern:'0 8 * * 1',tz:brand.timezone},{name:'growth:weekly-report',data:{brandId:brand.id},opts:{removeOnComplete:1000,removeOnFail:5000}});
  return brands.length;
}

export async function weeklyGrowthReport(input:{repos:Repositories;dispatcher:NotificationDispatcher;now?:number;brandId?:string}):Promise<{sent:number;failed:number}>{
  const now=input.now??Date.now(),brands=(await input.repos.brands.findBy({status:'ACTIVE'})).filter(brand=>!input.brandId||brand.id===input.brandId);
  let sent=0,failed=0;
  for(const brand of brands){
    const posts=(await input.repos.publishedPosts.findBy({brandId:brand.id})).filter(post=>post.publishedAt<=now&&post.publishedAt>now-7*86_400_000),postIds=new Set(posts.map(post=>post.id));
    const metrics=(await input.repos.postMetrics.findBy({})).filter(row=>postIds.has(row.publishedPostId)),content=new Map((await input.repos.contents.findBy({brandId:brand.id})).map(item=>[item.id,item.title])),variants=new Map((await input.repos.variants.findBy({})).map(item=>[item.id,item.contentItemId]));
    const latestByPost=new Map<string,typeof metrics[number]>();for(const row of [...metrics].sort((a,b)=>a.capturedAt-b.capturedAt))latestByPost.set(row.publishedPostId,row);
    const viewsRows=posts.map(post=>latestByPost.get(post.id)?.views),views=viewsRows.length&&viewsRows.every(value=>value!==undefined)?viewsRows.reduce<number>((sum,value)=>sum+(value??0),0):null;
    const accounts=await input.repos.socialAccounts.findBy({brandId:brand.id}),growth=new GrowthService(input.repos,()=>now),results=[];for(const account of accounts)results.push(await growth.account(brand.id,account.id,now,28));
    const knownDeltas=results.map(row=>'followersDelta' in row.growth?row.growth.followersDelta:null),followersDelta=knownDeltas.length&&knownDeltas.every(value=>value!==null)?knownDeltas.reduce<number>((sum,value)=>sum+(value??0),0):null;
    const lowest=results.flatMap(row=>row.health.parts.filter(part=>part.points!==null).map(part=>({key:part.key,ratio:part.max?part.points!/part.max:1}))).sort((a,b)=>a.ratio-b.ratio)[0];
    const actions:Record<string,string>={profile:'Hoàn thiện ảnh đại diện, mô tả và liên kết hồ sơ.',cadence:'Đặt mục tiêu đăng bài và duy trì nhịp đăng đều.',growth:'Tăng nội dung khám phá để cải thiện lượng người theo dõi.',engagement:'Thử lời kêu gọi bình luận và nội dung đối thoại.',reliability:'Kiểm tra lỗi đăng và kết nối tài khoản.'};
    const best=posts.map(post=>({post,metric:latestByPost.get(post.id)})).filter(item=>item.metric?.views!==undefined).sort((a,b)=>(b.metric?.views??0)-(a.metric?.views??0))[0];
    const capturedAt=Math.max(0,...metrics.map(row=>row.capturedAt)),sources=[...new Set(results.map(row=>row.metrics.followers.source).filter(value=>value!=='UNAVAILABLE'))];
    const event={kind:'WEEKLY_REPORT' as const,brandId:brand.id,sections:{posts:{value:posts.length,source:'DSM:published_posts',capturedAt:now},views:{value:views,source:metrics.length?'DSM:post_metrics':'UNAVAILABLE',capturedAt:capturedAt||null},followersDelta:{value:followersDelta,source:sources.join(',')||'UNAVAILABLE',capturedAt:results.map(row=>row.metrics.followers.capturedAt??0).filter(Boolean).sort((a,b)=>b-a)[0]??null},bestPost:best?{title:content.get(variants.get(best.post.contentVariantId)??'')??'Bài viết',views:best.metric!.views!,platform:best.post.platform,source:'DSM:post_metrics',capturedAt:best.metric!.capturedAt}:null,nextAction:lowest?actions[lowest.key]??'Kiểm tra kênh có điểm sức khỏe thấp.':'Kết nối kênh và thu thập dữ liệu để có gợi ý.'}};
    const outcome=await input.dispatcher.dispatch(brand.workspaceId,event);sent+=outcome.sent;failed+=outcome.failed;
  }
  return{sent,failed};
}
