import test from 'node:test';
import assert from 'node:assert/strict';
import {z} from 'zod';
import {MemoryStore} from '../../packages/shared/src/store.ts';
import {MemoryRepositories} from '../../packages/shared/src/memory-repositories.ts';
import {AiService} from '../../apps/api/src/modules/ai/ai.service.ts';

const schema=z.object({answer:z.string()});
function response(text='{"answer":"Xin chào"}',stop_reason='end_turn'){
  return {content:[{type:'text',text}],stop_reason,usage:{input_tokens:12,output_tokens:4,cache_read_input_tokens:7}};
}
async function setup(options:{quota?:boolean;reply?:ReturnType<typeof response>}={}){
  const repos=new MemoryRepositories(new MemoryStore());
  await repos.brands.insert({id:'b',workspaceId:'w',name:'Brand',slug:'brand',language:'vi',timezone:'Asia/Ho_Chi_Minh',currency:'VND',status:'ACTIVE'});
  const calls:any[]=[];
  const client={beta:{messages:{create:async(params:any)=>{calls.push(params);return options.reply??response()},stream:(params:any)=>({finalMessage:async()=>{calls.push(params);return options.reply??response()}})}}};
  const service=new AiService({client:client as any,repos,quota:async()=>options.quota!==false});
  return{repos,calls,service};
}

test('gửi model, fallback và beta header đúng',async()=>{
  const {service,calls}=await setup();
  assert.deepEqual((await service.run('CAPTION','b',schema,'Viết caption')).data,{answer:'Xin chào'});
  assert.equal(calls[0].model,'claude-opus-5-5');
  assert.equal(calls[0].fallbacks,'default');
  assert.deepEqual(calls[0].betas,['server-side-fallback-2026-07-01']);
  assert.equal(calls[0].max_tokens,16000);
  assert.equal(calls[0].output_config.effort,'medium');
  assert.equal(calls[0].system.length,2);
});

test('hết hạn mức không gọi API',async()=>{
  const {service,calls}=await setup({quota:false});
  await assert.rejects(service.run('CAPTION','b',schema,'Nội dung'),/AI_QUOTA_EXCEEDED/);
  assert.equal(calls.length,0);
});

test('refusal cả chuỗi trả AI_REFUSED',async()=>{
  const {service}=await setup({reply:response('', 'refusal')});
  await assert.rejects(service.run('CAPTION','b',schema,'Nội dung'),/AI_REFUSED/);
});

test('JSON sai schema ném AI_INVALID_OUTPUT',async()=>{
  const {service}=await setup({reply:response('{"wrong":1}')});
  await assert.rejects(service.run('CAPTION','b',schema,'Nội dung'),/AI_INVALID_OUTPUT/);
});

test('đổi brand voice đổi phần system có cache',async()=>{
  const {service,repos,calls}=await setup();
  await repos.brandVoices.insert({id:'voice',brandId:'b',version:1,tone:'Thân thiện',doList:[],dontList:[],samplePosts:[]});
  await service.run('CAPTION','b',schema,'Nội dung');
  await repos.brandVoices.update('voice',{version:2,tone:'Trang trọng'});
  await service.run('CAPTION','b',schema,'Nội dung');
  assert.equal(calls[0].system[0].text,calls[1].system[0].text);
  assert.notEqual(calls[0].system[1].text,calls[1].system[1].text);
  assert.equal(calls[0].system[1].cache_control.type,'ephemeral');
});

test('ghi AiUsage bao gồm cache read',async()=>{
  const {service,repos}=await setup();
  assert.deepEqual((await service.run('CAPTION','b',schema,'Nội dung')).usage,{input:12,output:4,cacheRead:7});
  const rows=await repos.aiUsage.findBy({workspaceId:'w'});
  assert.equal(rows.length,1);
  assert.equal(rows[0]?.task,'CAPTION');
  assert.equal(rows[0]?.cacheReadTokens,7);
});
