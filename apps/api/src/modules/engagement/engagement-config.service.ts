import type {Repositories} from '../../../../../packages/shared/src/repositories.ts';
import type {AutomationRule,ReplyTemplate,Platform} from '../../../../../packages/shared/src/domain.ts';
import {id} from '../../../../../packages/shared/src/ids.ts';

const supportedPlatforms:Platform[]=['FACEBOOK','INSTAGRAM','YOUTUBE'];
function nonempty(value:unknown,max:number):string{if(typeof value!=='string'||!value.trim()||value.length>max)throw new Error('INVALID_ENGAGEMENT_CONFIG');return value.trim()}
function ruleInput(value:unknown):Omit<AutomationRule,'id'|'brandId'> {
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('INVALID_ENGAGEMENT_CONFIG');
  const input=value as Record<string,unknown>,match=input.match as Record<string,unknown>|undefined,actions=input.actions as Record<string,unknown>|undefined;
  const platforms=input.platforms;
  if(!Array.isArray(platforms)||!platforms.length||platforms.some(item=>!supportedPlatforms.includes(item)))throw new Error('INVALID_ENGAGEMENT_CONFIG');
  if(!match||!Array.isArray(match.keywords)||!match.keywords.length||match.keywords.length>20||match.keywords.some(item=>typeof item!=='string'||!item.trim()||item.length>80)||!['ANY','ALL'].includes(String(match.mode)))throw new Error('INVALID_ENGAGEMENT_CONFIG');
  if(!actions||typeof actions!=='object')throw new Error('INVALID_ENGAGEMENT_CONFIG');
  const reply=actions.reply===undefined?undefined:nonempty(actions.reply,2000),privateReply=actions.privateReply===undefined?undefined:nonempty(actions.privateReply,2000),hide=actions.hide===true;
  if(!reply&&!privateReply&&!hide)throw new Error('INVALID_ENGAGEMENT_CONFIG');
  if((privateReply||hide)&&platforms.includes('YOUTUBE'))throw new Error('INVALID_ENGAGEMENT_CONFIG');
  const maxPerHour=Number(input.maxPerHour??30);if(!Number.isInteger(maxPerHour)||maxPerHour<1||maxPerHour>1000)throw new Error('INVALID_ENGAGEMENT_CONFIG');
  return{name:nonempty(input.name,100),enabled:input.enabled===true,platforms,match:{keywords:match.keywords.map((item:string)=>item.trim()),mode:match.mode as 'ANY'|'ALL'},actions:{...(reply?{reply}:{}),...(privateReply?{privateReply}:{}),...(hide?{hide:true}:{})},maxPerHour};
}

export class EngagementConfigService{
  private readonly repos:Repositories;
  constructor(repos:Repositories){this.repos=repos}
  listTemplates(brandId:string){return this.repos.replyTemplates.findBy({brandId})}
  listRules(brandId:string){return this.repos.automationRules.findBy({brandId})}
  createTemplate(brandId:string,input:unknown):Promise<ReplyTemplate>{const value=input as Record<string,unknown>;return this.repos.replyTemplates.insert({id:id('reply-template'),brandId,name:nonempty(value?.name,100),text:nonempty(value?.text,2000)})}
  async updateTemplate(brandId:string,templateId:string,input:unknown):Promise<ReplyTemplate>{const old=await this.repos.replyTemplates.get(templateId);if(!old||old.brandId!==brandId)throw new Error('TEMPLATE_NOT_FOUND');const value=input as Record<string,unknown>;return this.repos.replyTemplates.update(templateId,{name:nonempty(value?.name,100),text:nonempty(value?.text,2000)})}
  async removeTemplate(brandId:string,templateId:string):Promise<void>{const old=await this.repos.replyTemplates.get(templateId);if(!old||old.brandId!==brandId)throw new Error('TEMPLATE_NOT_FOUND');await this.repos.replyTemplates.remove(templateId)}
  createRule(brandId:string,input:unknown):Promise<AutomationRule>{return this.repos.automationRules.insert({id:id('automation-rule'),brandId,...ruleInput(input),enabled:false})}
  async updateRule(brandId:string,ruleId:string,input:unknown):Promise<AutomationRule>{const old=await this.repos.automationRules.get(ruleId);if(!old||old.brandId!==brandId)throw new Error('RULE_NOT_FOUND');return this.repos.automationRules.update(ruleId,ruleInput(input))}
  async removeRule(brandId:string,ruleId:string):Promise<void>{const old=await this.repos.automationRules.get(ruleId);if(!old||old.brandId!==brandId)throw new Error('RULE_NOT_FOUND');await this.repos.automationRules.remove(ruleId)}
}
