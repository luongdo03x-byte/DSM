import Anthropic from '@anthropic-ai/sdk';
import {zodOutputFormat} from '@anthropic-ai/sdk/helpers/zod';
import type {z} from 'zod';
import type {AiTask,ContentFormat,Platform} from '../../../../../packages/shared/src/domain.ts';
import type {Repositories} from '../../../../../packages/shared/src/repositories.ts';
import {id} from '../../../../../packages/shared/src/ids.ts';
import {MEDIA_RULES} from '../../../../../packages/shared/src/media-rules.ts';
import {preflight,type PreflightIssue} from '../../../../../packages/shared/src/preflight.ts';
import {buildSystem} from './prompts.ts';
import {CaptionSuggestionsSchema,type CaptionSuggestion} from './schemas.ts';

export type {AiTask};
export interface AiClient {
  beta:{messages:{
    create(params:Anthropic.Beta.MessageCreateParamsNonStreaming):Promise<Anthropic.Beta.BetaMessage>;
    stream(params:Anthropic.Beta.MessageCreateParamsStreaming):{finalMessage():Promise<Anthropic.Beta.BetaMessage>};
  }};
}

export class AiService {
  private readonly client:AiClient;
  private readonly repos:Repositories;
  private readonly quota:(workspaceId:string,task:AiTask)=>Promise<boolean>;
  private readonly model:string;
  private readonly effort:Partial<Record<AiTask,'low'|'medium'|'high'>>;
  constructor(deps:{client:AiClient;repos:Repositories;quota:(workspaceId:string,task:AiTask)=>Promise<boolean>;model?:string;effort?:Partial<Record<AiTask,'low'|'medium'|'high'>>}){
    this.client=deps.client;this.repos=deps.repos;this.quota=deps.quota;this.model=deps.model??'claude-opus-5-5';this.effort=deps.effort??{};
  }

  async run<T>(task:AiTask,brandId:string,schema:z.ZodType<T>,userContent:string,opts:{stream?:boolean}={}):Promise<{data:T;usage:{input:number;output:number;cacheRead:number}}>{
    const brand=await this.repos.brands.get(brandId);
    if(!brand)throw new Error('AI_BRAND_NOT_FOUND');
    if(!await this.quota(brand.workspaceId,task))throw new Error('AI_QUOTA_EXCEEDED');
    const voice=(await this.repos.brandVoices.findBy({brandId})).sort((a,b)=>b.version-a.version)[0];
    const params={model:this.model,max_tokens:opts.stream?64000:16000,betas:['server-side-fallback-2026-07-01'],fallbacks:'default' as const,system:buildSystem(voice),output_config:{effort:this.effort[task]??'medium',format:zodOutputFormat(schema)},messages:[{role:'user' as const,content:userContent}]};
    let message:Anthropic.Beta.BetaMessage;
    try{
      message=opts.stream?await this.client.beta.messages.stream({...params,stream:true} as Anthropic.Beta.MessageCreateParamsStreaming).finalMessage():await this.client.beta.messages.create(params as Anthropic.Beta.MessageCreateParamsNonStreaming);
    }catch(error){
      if(error instanceof Anthropic.RateLimitError)throw new Error('AI_BUSY');
      if(error instanceof Anthropic.BadRequestError)throw new Error('AI_BAD_REQUEST');
      if(error instanceof Anthropic.APIError)throw new Error('AI_UNAVAILABLE');
      throw error;
    }
    const usage={input:message.usage.input_tokens,output:message.usage.output_tokens,cacheRead:message.usage.cache_read_input_tokens??0};
    await this.repos.aiUsage.append({id:id('ai-usage'),workspaceId:brand.workspaceId,task,inputTokens:usage.input,outputTokens:usage.output,cacheReadTokens:usage.cacheRead,createdAt:Date.now()});
    if(message.stop_reason==='refusal')throw new Error('AI_REFUSED');
    const text=message.content.find(block=>block.type==='text');
    if(!text)throw new Error('AI_INVALID_OUTPUT');
    try{return{data:schema.parse(JSON.parse(text.text)),usage}}catch{throw new Error('AI_INVALID_OUTPUT')}
  }

  async captions(brandId:string,contentId:string,platforms:Platform[],n:1|2|3=1):Promise<{suggestions:(CaptionSuggestion&{issues:PreflightIssue[]})[]}>{
    const content=await this.repos.contents.get(contentId);
    if(!content||content.brandId!==brandId)throw new Error('CONTENT_NOT_FOUND');
    if(!platforms.length||new Set(platforms).size!==platforms.length||platforms.some(platform=>!MEDIA_RULES[platform])||![1,2,3].includes(n))throw new Error('INVALID_AI_REQUEST');
    const product=content.productId?await this.repos.products.get(content.productId):undefined;
    const prompt=JSON.stringify({task:'Viết caption, hook, hashtag tiếng Việt. Chỉ dùng dữ kiện được cung cấp; trả đúng nền tảng và số biến thể.',platforms,variantsPerPlatform:n,content:{title:content.title,hook:content.hook,body:content.body,cta:content.cta,type:content.type},product:product&&product.brandId===brandId?{name:product.name,description:product.description}:undefined});
    const {data}=await this.run('CAPTION',brandId,CaptionSuggestionsSchema,prompt);
    if(data.suggestions.some(suggestion=>!platforms.includes(suggestion.platform))||platforms.some(platform=>data.suggestions.filter(suggestion=>suggestion.platform===platform).length!==n))throw new Error('AI_INVALID_OUTPUT');
    return{suggestions:data.suggestions.map(suggestion=>{
      const rule=MEDIA_RULES[suggestion.platform],format=(content.type==='VIDEO'?(suggestion.platform==='INSTAGRAM'?'REEL':'VIDEO'):content.type) as ContentFormat;
      const hashtags=suggestion.hashtags.map(tag=>tag.trim()).filter(Boolean);
      const issues:PreflightIssue[]=[];
      if(rule.hashtagMax!==undefined&&hashtags.length>rule.hashtagMax){hashtags.splice(rule.hashtagMax);issues.push({code:`${suggestion.platform==='INSTAGRAM'?'IG':suggestion.platform}_HASHTAG_MAX`,severity:'warning',message:`Đã cắt bớt hashtag còn tối đa ${rule.hashtagMax}.`,field:'hashtags'})}
      let caption=suggestion.caption;
      if(caption.length>rule.captionMax){caption=caption.slice(0,rule.captionMax);issues.push({code:`${suggestion.platform}_CAPTION_MAX`,severity:'warning',message:`Đã cắt nội dung còn tối đa ${rule.captionMax} ký tự.`,field:'caption'})}
      issues.push(...preflight({platform:suggestion.platform,format,caption,hashtags,media:[],...(suggestion.platform==='YOUTUBE'?{youtube:{madeForKids:false}}:{})}).filter(issue=>issue.field==='caption'||issue.field==='hashtags'));
      return{...suggestion,caption,hashtags,issues};
    })};
  }
}
