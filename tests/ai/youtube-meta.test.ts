import test from 'node:test';
import assert from 'node:assert/strict';
import {MemoryStore} from '../../packages/shared/src/store.ts';
import {MemoryRepositories} from '../../packages/shared/src/memory-repositories.ts';
import {AiService} from '../../apps/api/src/modules/ai/ai.service.ts';
import {createDevelopmentRuntime} from '../../apps/api/src/runtime/dev-runtime.ts';

async function setup(output:unknown){
  const repos=new MemoryRepositories(new MemoryStore());
  await repos.brands.insert({id:'b',workspaceId:'w',name:'B',slug:'b',language:'vi',timezone:'Asia/Ho_Chi_Minh',currency:'VND',status:'ACTIVE'});
  await repos.contents.insert({id:'c',brandId:'b',type:'VIDEO',title:'Bánh Huế',body:'Video giới thiệu bánh',status:'DRAFT'});
  const client={beta:{messages:{create:async()=>({content:[{type:'text',text:JSON.stringify(output)}],stop_reason:'end_turn',usage:{input_tokens:1,output_tokens:1}}),stream:()=>{throw new Error('unexpected')}}}};
  return new AiService({repos,client:client as any,quota:async()=>true});
}
const base={titles:['Bánh Huế ngon','Khám phá bánh Huế','Cách chọn bánh Huế'],description:'Bánh Huế ngon.',tags:['bánh Huế'],chapters:[{start:'0:00',title:'Mở đầu'},{start:'0:30',title:'Chi tiết'}]};

test('tiêu đề trên 100 ký tự bị loại khỏi gợi ý',async()=>{
  const service=await setup({...base,titles:[...base.titles,'Dài'.repeat(40)]});
  const result=await service.youtubeMeta('b','c');
  assert.equal(result.titles.length,3);
  assert.ok(result.issues.some(issue=>issue.code==='YT_TITLE_MAX'&&issue.severity==='warning'));
});

test('chapter đầu tiên không bắt đầu 0:00 thì bỏ toàn bộ chapter kèm cảnh báo',async()=>{
  const service=await setup({...base,chapters:[{start:'0:05',title:'Sai mốc'},{start:'0:30',title:'Phần hai'}]});
  const result=await service.youtubeMeta('b','c');
  assert.deepEqual(result.chapters,[]);
  assert.ok(result.issues.some(issue=>issue.code==='YT_CHAPTER_START'));
});

test('mô tả chứa dấu ngoặc nhọn của preflight được làm sạch',async()=>{
  const service=await setup({...base,description:'Khám phá <bánh Huế> ngon'});
  const result=await service.youtubeMeta('b','c');
  assert.equal(result.description,'Khám phá bánh Huế ngon');
  assert.ok(result.issues.some(issue=>issue.code==='YT_DESCRIPTION_ANGLE_BRACKETS'));
});

test('route YouTube trả gợi ý mà không sửa bản nháp',async()=>{
  const client={beta:{messages:{create:async()=>({content:[{type:'text',text:JSON.stringify(base)}],stop_reason:'end_turn',usage:{input_tokens:1,output_tokens:1}}),stream:()=>{throw new Error('unexpected')}}}};
  const app=await createDevelopmentRuntime({env:{DEV_OWNER_PASSWORD:'secret',CREDENTIAL_ENCRYPTION_KEY:Buffer.alloc(32,3).toString('base64')},aiClient:client as any});
  await app.repos.contents.insert({id:'content',brandId:'local-brand',type:'VIDEO',title:'Nháp gốc',status:'DRAFT'});
  const login=await app.runtime.handle({method:'POST',path:'/auth/login',body:{email:'owner@local.test',password:'secret'}});
  const headers={authorization:'Bearer '+(login.body as {accessToken:string}).accessToken};
  const result=await app.runtime.handle({method:'POST',path:'/brands/local-brand/ai/youtube-meta',headers,body:{contentId:'content'}});
  assert.equal(result.status,200);
  assert.deepEqual((result.body as any).titles,base.titles);
  assert.equal((await app.repos.contents.get('content'))?.title,'Nháp gốc');
});
