import test from 'node:test';
import assert from 'node:assert/strict';
import {MemoryStore} from '../../packages/shared/src/store.ts';
import {MemoryRepositories} from '../../packages/shared/src/memory-repositories.ts';
import {AiService} from '../../apps/api/src/modules/ai/ai.service.ts';
import {createDevelopmentRuntime} from '../../apps/api/src/runtime/dev-runtime.ts';

function setup(hashtags=['#đặc_sản','#món_ngon','#quà_tặng','#ăn_vặt','#Việt_Nam','#sáu','#bảy','#tám']){
  const repos=new MemoryRepositories(new MemoryStore());
  const calls:any[]=[];
  const client={beta:{messages:{create:async(params:any)=>{calls.push(params);return{content:[{type:'text',text:JSON.stringify({suggestions:[{platform:'INSTAGRAM',hook:'Món ngon',caption:'Mời bạn xem món ngon',hashtags,rationale:'Phù hợp Instagram'}]})}],stop_reason:'end_turn',usage:{input_tokens:1,output_tokens:1}}},stream:()=>{throw new Error('unexpected')}}}};
  const service=new AiService({client:client as any,repos,quota:async()=>true});
  return{repos,calls,service};
}

test('kết quả IG tám hashtag được cắt còn năm với cảnh báo preflight',async()=>{
  const {repos,service}=setup();
  await repos.brands.insert({id:'b',workspaceId:'w',name:'B',slug:'b',language:'vi',timezone:'Asia/Ho_Chi_Minh',currency:'VND',status:'ACTIVE'});
  await repos.contents.insert({id:'c',brandId:'b',type:'IMAGE',title:'Món ngon',body:'Sản phẩm sạch',status:'DRAFT'});
  const result=await service.captions('b','c',['INSTAGRAM'],1);
  assert.equal(result.suggestions[0]?.hashtags.length,5);
  assert.deepEqual(result.suggestions[0]?.issues.find(issue=>issue.code==='IG_HASHTAG_MAX'),{code:'IG_HASHTAG_MAX',severity:'warning',message:'Đã cắt bớt hashtag còn tối đa 5.',field:'hashtags'});
});

test('prompt dùng nội dung gốc và quy tắc nền tảng, không gửi bình luận cá nhân',async()=>{
  const {repos,service,calls}=setup(['#đặc_sản']);
  await repos.brands.insert({id:'b',workspaceId:'w',name:'B',slug:'b',language:'vi',timezone:'Asia/Ho_Chi_Minh',currency:'VND',status:'ACTIVE'});
  await repos.contents.insert({id:'c',brandId:'b',type:'IMAGE',title:'Đặc sản Huế',body:'Bánh thật, giá 100000',status:'DRAFT'});
  await repos.socialComments.insert({id:'comment',brandId:'b',socialAccountId:'a',platform:'FACEBOOK',platformCommentId:'remote',platformPostId:'post',authorId:'private-id',authorName:'Khách bí mật',isFromPage:false,text:'Số điện thoại 0912345678',createdAt:1,status:'NEW'});
  await service.captions('b','c',['INSTAGRAM'],1);
  const sent=JSON.stringify(calls[0]);
  assert.match(sent,/Đặc sản Huế/);
  assert.match(sent,/hashtagMax/);
  assert.doesNotMatch(sent,/0912345678|Khách bí mật|private-id/);
});

test('hashtag tiếng Việt giữ dấu',async()=>{
  const {repos,service}=setup(['#đặc_sản']);
  await repos.brands.insert({id:'b',workspaceId:'w',name:'B',slug:'b',language:'vi',timezone:'Asia/Ho_Chi_Minh',currency:'VND',status:'ACTIVE'});
  await repos.contents.insert({id:'c',brandId:'b',type:'IMAGE',title:'Đặc sản',status:'DRAFT'});
  const result=await service.captions('b','c',['INSTAGRAM'],1);
  assert.deepEqual(result.suggestions[0]?.hashtags,['#đặc_sản']);
});

test('AI thiếu biến thể yêu cầu thì không trả danh sách gợi ý dở dang',async()=>{
  const {repos,service}=setup(['#đặc_sản']);
  await repos.brands.insert({id:'b',workspaceId:'w',name:'B',slug:'b',language:'vi',timezone:'Asia/Ho_Chi_Minh',currency:'VND',status:'ACTIVE'});
  await repos.contents.insert({id:'c',brandId:'b',type:'IMAGE',title:'Đặc sản',status:'DRAFT'});
  await assert.rejects(service.captions('b','c',['INSTAGRAM'],2),/AI_INVALID_OUTPUT/);
});

test('route caption chỉ tạo gợi ý sau khi xác thực, không đổi bản nháp',async()=>{
  const client={beta:{messages:{create:async()=>({content:[{type:'text',text:JSON.stringify({suggestions:[{platform:'INSTAGRAM',hook:'Món ngon',caption:'Nội dung gợi ý',hashtags:['#món_ngon'],rationale:'Đúng giọng'}]})}],stop_reason:'end_turn',usage:{input_tokens:1,output_tokens:1}}),stream:()=>{throw new Error('unexpected')}}}};
  const app=await createDevelopmentRuntime({env:{DEV_OWNER_PASSWORD:'secret',CREDENTIAL_ENCRYPTION_KEY:Buffer.alloc(32,2).toString('base64')},aiClient:client as any});
  await app.repos.contents.insert({id:'content',brandId:'local-brand',type:'IMAGE',title:'Nháp gốc',status:'DRAFT'});
  const denied=await app.runtime.handle({method:'POST',path:'/brands/local-brand/ai/captions',body:{contentId:'content',platforms:['INSTAGRAM']}});
  assert.equal(denied.status,401);
  const login=await app.runtime.handle({method:'POST',path:'/auth/login',body:{email:'owner@local.test',password:'secret'}});
  const headers={authorization:'Bearer '+(login.body as {accessToken:string}).accessToken};
  const result=await app.runtime.handle({method:'POST',path:'/brands/local-brand/ai/captions',headers,body:{contentId:'content',platforms:['INSTAGRAM']}});
  assert.equal(result.status,200);
  assert.equal((result.body as any).suggestions[0].caption,'Nội dung gợi ý');
  assert.equal((await app.repos.contents.get('content'))?.title,'Nháp gốc');
});
