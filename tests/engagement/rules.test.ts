import test from 'node:test';
import assert from 'node:assert/strict';
import {matchRules,normalizeVi,renderTemplate} from '../../packages/shared/src/engagement/rules.ts';
import type {AutomationRule,SocialComment} from '../../packages/shared/src/domain.ts';
import {MemoryStore} from '../../packages/shared/src/store.ts';
import {MemoryRepositories} from '../../packages/shared/src/memory-repositories.ts';
import {EngagementService} from '../../apps/api/src/modules/engagement/engagement.service.ts';
import {runRulesForComment} from '../../apps/worker/src/engagement/run-rules.job.ts';
import {EngagementConfigService} from '../../apps/api/src/modules/engagement/engagement-config.service.ts';

const comment:SocialComment={id:'c',brandId:'b',socialAccountId:'a',platform:'FACEBOOK',platformCommentId:'remote',platformPostId:'post',authorId:'person',authorName:'Nguyễn An',isFromPage:false,text:'GIA BAO NHIEU vậy shop',createdAt:1,status:'NEW'};
const rule:AutomationRule={id:'r',brandId:'b',name:'Giá',enabled:true,platforms:['FACEBOOK'],match:{keywords:['giá bao nhiêu'],mode:'ANY'},actions:{reply:'Chào {ten}, xem {link}'},maxPerHour:30};

test('từ khóa khớp không phân biệt dấu và mẫu câu thay biến',()=>{
  assert.equal(normalizeVi('ĐẶT   HÀNG'),'dat hang');
  const matches=matchRules(comment,[rule],{});
  assert.deepEqual(matches,[{ruleId:'r',actions:['REPLY'],texts:{reply:'Chào {ten}, xem {link}'}}]);
  assert.equal(renderTemplate(rule.actions.reply!,{authorName:'Nguyễn An',link:'https://example.test'}),'Chào Nguyễn An, xem https://example.test');
});
test('bỏ qua bình luận của chính trang, quy tắc tắt và giới hạn giờ',()=>{
  assert.deepEqual(matchRules({...comment,isFromPage:true},[rule],{}),[]);
  assert.deepEqual(matchRules(comment,[{...rule,enabled:false}],{}),[]);
  assert.deepEqual(matchRules(comment,[rule],{r:30}),[]);
});
test('ALL cần mọi từ khóa và bỏ qua nền tảng khác',()=>{
  const all={...rule,match:{keywords:['gia','ship'],mode:'ALL' as const}};
  assert.deepEqual(matchRules(comment,[all],{}),[]);
  assert.deepEqual(matchRules(comment,[{...rule,platforms:['INSTAGRAM']}],{}),[]);
});
test('quy tắc chỉ gửi một lần cho bình luận mới',async()=>{
  const repos=new MemoryRepositories(new MemoryStore());
  await repos.socialComments.insert(comment);await repos.automationRules.insert(rule);
  await repos.socialAccounts.insert({id:'a',brandId:'b',platform:'FACEBOOK',platformAccountId:'page',publishMode:'API',status:'CONNECTED'});
  const sent:string[]=[];
  const engagement=new EngagementService(repos,{FACEBOOK:{listSince:async()=>[],reply:async(_account,_id,text)=>{sent.push(text);return{platformCommentId:'reply-1'}},hide:async()=>{}}});
  assert.equal(await runRulesForComment(repos,'c',engagement),1);
  assert.equal(await runRulesForComment(repos,'c',engagement),0);
  assert.deepEqual(sent,['Chào Nguyễn An, xem']);
  assert.equal((await repos.commentActions.findBy({ruleId:'r'}))[0]?.status,'DONE');
});

test('không lưu quy tắc có thao tác mà nền tảng không hỗ trợ',async()=>{
  const config=new EngagementConfigService(new MemoryRepositories(new MemoryStore()));
  const base={name:'Tư vấn',platforms:['YOUTUBE'],match:{keywords:['giá'],mode:'ANY'},maxPerHour:30};
  assert.throws(()=>config.createRule('b',{...base,actions:{privateReply:'Chào bạn'}}),/INVALID_ENGAGEMENT_CONFIG/);
  assert.throws(()=>config.createRule('b',{...base,actions:{hide:true}}),/INVALID_ENGAGEMENT_CONFIG/);
});
