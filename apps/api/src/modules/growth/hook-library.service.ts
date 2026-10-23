import type {Platform} from '../../../../../packages/shared/src/domain.ts';
import type {Repositories} from '../../../../../packages/shared/src/repositories.ts';

export class HookLibrary{
  private readonly repos:Repositories;
  private readonly now:()=>number;
  constructor(repos:Repositories,now:()=>number=Date.now){this.repos=repos;this.now=now}
  async top(brandId:string,limit=50):Promise<{hook:string;views:number;platform:Platform;postUrl?:string}[]>{
    if(!Number.isInteger(limit)||limit<1||limit>100)throw new Error('INVALID_LIMIT');
    const posts=(await this.repos.publishedPosts.findBy({brandId})).filter(post=>post.publishedAt>=this.now()-90*86_400_000&&post.publishedAt<=this.now());
    const rows:{hook:string;views:number;platform:Platform;postUrl?:string}[]=[];
    for(const post of posts){
      const variant=await this.repos.variants.get(post.contentVariantId),content=variant?await this.repos.contents.get(variant.contentItemId):undefined;
      if(!content?.hook||content.brandId!==brandId)continue;
      const metric=(await this.repos.postMetrics.findBy({publishedPostId:post.id})).sort((a,b)=>b.capturedAt-a.capturedAt)[0];
      if(metric?.views===undefined)continue;
      rows.push({hook:content.hook,views:metric.views,platform:post.platform,...(post.platformPostUrl?{postUrl:post.platformPostUrl}:{})});
    }
    rows.sort((a,b)=>b.views-a.views||a.hook.localeCompare(b.hook));
    return rows.slice(0,Math.min(limit,Math.max(1,Math.ceil(rows.length*0.1))));
  }
}
