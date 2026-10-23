import test from 'node:test';
import assert from 'node:assert/strict';
import {MemoryStore} from '../../packages/shared/src/store.ts';
import {MemoryRepositories} from '../../packages/shared/src/memory-repositories.ts';
import {HookLibrary} from '../../apps/api/src/modules/growth/hook-library.service.ts';

test('thư viện hook chỉ lấy top 10% bài theo lượt xem 90 ngày',async()=>{
  const repos=new MemoryRepositories(new MemoryStore());
  const now=Date.parse('2026-11-30T00:00:00Z');
  for(let index=1;index<=20;index++){
    const contentId=`content-${index}`,variantId=`variant-${index}`,postId=`post-${index}`;
    await repos.contents.insert({id:contentId,brandId:'b',type:'VIDEO',title:`Bài ${index}`,hook:`Hook ${index}`,status:'READY'});
    await repos.variants.insert({id:variantId,contentItemId:contentId,platform:'YOUTUBE',hashtags:[],status:'READY'});
    await repos.publishedPosts.insert({id:postId,brandId:'b',publishJobId:`job-${index}`,socialAccountId:'a',contentVariantId:variantId,platform:'YOUTUBE',platformPostId:`remote-${index}`,platformPostUrl:`https://youtube.test/${index}`,publishedAt:now-10*86_400_000});
    await repos.postMetrics.append({id:`metric-${index}`,publishedPostId:postId,capturedAt:now-9*86_400_000,captureKey:'latest',views:index*100});
  }
  const hooks=await new HookLibrary(repos,()=>now).top('b');
  assert.deepEqual(hooks.map(value=>value.hook),['Hook 20','Hook 19']);
  assert.deepEqual(hooks.map(value=>value.views),[2000,1900]);
});
