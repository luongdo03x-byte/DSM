import {test} from 'node:test';
import assert from 'node:assert/strict';
import {MemoryStore} from '../../packages/shared/src/store.ts';
import {MemoryRepositories} from '../../packages/shared/src/memory-repositories.ts';
import {TrackingService} from '../../apps/api/src/modules/tracking/tracking.service.ts';

test('redirect preserves target query and applies UTM parameters while recording a click', async()=>{
  const repos=new MemoryRepositories(new MemoryStore());
  const tracking=new TrackingService(repos);
  const {code}=await tracking.create('brand',{targetUrl:'https://shop.test/p?ref=1',utmSource:'instagram',utmMedium:'bio',utmCampaign:'launch',utmContent:'button'});
  const target=new URL(await tracking.resolve(code,{referrer:'https://instagram.com'}));
  assert.equal(target.searchParams.get('ref'),'1');
  assert.equal(target.searchParams.get('utm_source'),'instagram');
  assert.equal(target.searchParams.get('utm_medium'),'bio');
  assert.equal(target.searchParams.get('utm_campaign'),'launch');
  assert.equal(target.searchParams.get('utm_content'),'button');
  assert.equal((await repos.clickEvents.findBy({})).length,1);
});

test('bound link credits clicks to the published post and rejects cross-brand binding',async()=>{
  const repos=new MemoryRepositories(new MemoryStore());
  const tracking=new TrackingService(repos);
  const {id,code}=await tracking.create('brand',{targetUrl:'https://shop.test/p'});
  await repos.publishedPosts.insert({id:'post',brandId:'brand',publishJobId:'job',socialAccountId:'account',contentVariantId:'variant',platform:'INSTAGRAM',platformPostId:'remote',publishedAt:Date.now()});
  await tracking.bindToPublishedPost('brand',id,'post');
  await tracking.resolve(code,{});
  assert.equal((await repos.trackedLinks.get(id))?.publishedPostId,'post');
  assert.equal((await repos.clickEvents.findBy({trackedLinkId:id})).length,1);
  await assert.rejects(tracking.bindToPublishedPost('other',id,'post'),/BINDING_NOT_FOUND/);
});
