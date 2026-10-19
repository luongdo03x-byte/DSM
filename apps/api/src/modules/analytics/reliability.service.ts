import type {Repositories} from '../../../../../packages/shared/src/repositories.ts';

export interface ReliabilitySummary{published:number;failedPlatform:number;failedUser:number;successRate:number|null}
export class ReliabilityService{
  private readonly repos:Repositories;
  constructor(repos:Repositories){this.repos=repos}
  async summary(brandId:string,since:number):Promise<ReliabilitySummary>{
    if(!Number.isFinite(since))throw new Error('INVALID_DATE_RANGE');
    const published=(await this.repos.publishedPosts.findBy({brandId})).filter(post=>post.publishedAt>=since).length;
    let failedPlatform=0,failedUser=0;
    for(const job of (await this.repos.publishJobs.findBy({brandId,status:'FAILED'})).filter(row=>row.scheduledAt>=since)){
      const attempts=await this.repos.publishAttempts.findBy({publishJobId:job.id});
      const last=attempts.sort((a,b)=>b.attemptNumber-a.attemptNumber)[0];
      if(['AUTH_ERROR','VALIDATION_ERROR'].includes(last?.errorType??job.errorCode??''))failedUser++;
      else failedPlatform++;
    }
    const denominator=published+failedPlatform;
    return{published,failedPlatform,failedUser,successRate:denominator?published/denominator:null};
  }
}
