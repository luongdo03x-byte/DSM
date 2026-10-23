import Anthropic from '@anthropic-ai/sdk';
import {zodOutputFormat} from '@anthropic-ai/sdk/helpers/zod';
import type {z} from 'zod';
import type {AiTask} from '../../../../../packages/shared/src/domain.ts';
import type {Repositories} from '../../../../../packages/shared/src/repositories.ts';
import {id} from '../../../../../packages/shared/src/ids.ts';
import {buildSystem} from './prompts.ts';

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
}
