import type {Repositories} from '../../../../packages/shared/src/repositories.ts';
import {matchRules,renderTemplate} from '../../../../packages/shared/src/engagement/rules.ts';
import {EngagementService} from '../../../api/src/modules/engagement/engagement.service.ts';

const ONE_HOUR=60*60_000;

export async function runRulesForComment(repos:Repositories,commentId:string,engagement:EngagementService,now=Date.now()):Promise<number>{
  const comment=await repos.socialComments.get(commentId);
  if(!comment||comment.status!=='NEW'||comment.isFromPage)return 0;
  const rules=await repos.automationRules.findBy({brandId:comment.brandId,enabled:true});
  const recentCounts:Record<string,number>={};
  for(const rule of rules){
    const actions=await repos.commentActions.findBy({ruleId:rule.id});
    recentCounts[rule.id]=new Set(actions.filter(action=>action.createdAt>=now-ONE_HOUR&&action.status!=='FAILED').map(action=>action.commentId)).size;
  }
  let completed=0;
  for(const match of matchRules(comment,rules,recentCounts)){
    for(const kind of match.actions){
      if((await repos.commentActions.findBy({commentId,ruleId:match.ruleId,kind})).length)continue;
      const current=await repos.socialComments.get(commentId);
      if(!current||current.status==='DELETED')return completed;
      const vars={authorName:comment.authorName};
      try{
        if(kind==='REPLY'&&match.texts.reply){await engagement.reply(comment.brandId,commentId,renderTemplate(match.texts.reply,vars),'automation',match.ruleId);completed++}
        else if(kind==='HIDE'){await engagement.hide(comment.brandId,commentId,true,'automation',match.ruleId);completed++}
        else if(kind==='PRIVATE_REPLY'&&match.texts.privateReply&&'privateReply' in engagement){
          const service=engagement as EngagementService&{privateReply(brandId:string,commentId:string,text:string,userId:string,ruleId?:string):Promise<unknown>};
          await service.privateReply(comment.brandId,commentId,renderTemplate(match.texts.privateReply,vars),'automation',match.ruleId);completed++;
        }
      }catch(error){console.error('comment automation failed',match.ruleId,commentId,kind,error)}
    }
  }
  return completed;
}
