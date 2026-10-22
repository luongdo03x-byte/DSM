import {test} from 'node:test';
import assert from 'node:assert/strict';
import {MemoryStore} from '../../packages/shared/src/store.ts';
import {MemoryRepositories} from '../../packages/shared/src/memory-repositories.ts';
import {TrackingService} from '../../apps/api/src/modules/tracking/tracking.service.ts';
import {BioPageService} from '../../apps/api/src/modules/tracking/bio-page.service.ts';

test('public bio page sorts links by position and links record clicks through redirect',async()=>{
  const repos=new MemoryRepositories(new MemoryStore()),tracking=new TrackingService(repos),bio=new BioPageService(repos);
  const first=await tracking.create('brand',{targetUrl:'https://shop.test/one'}),second=await tracking.create('brand',{targetUrl:'https://shop.test/two'});
  await bio.save('brand',{slug:'my-shop',title:'My Shop',links:[{trackedLinkId:first.id,label:'One',position:2},{trackedLinkId:second.id,label:'Two',position:1}]});
  const page=await bio.getPublic('my-shop');
  assert.deepEqual(page.links.map(link=>link.label),['Two','One']);
  assert.equal(page.links[0]?.url,'/r/'+second.code);
  await tracking.resolve(second.code,{});
  assert.equal((await repos.clickEvents.findBy({trackedLinkId:second.id})).length,1);
});

test('bio page rejects links from other brands and duplicate slugs',async()=>{
  const repos=new MemoryRepositories(new MemoryStore()),tracking=new TrackingService(repos),bio=new BioPageService(repos);
  const link=await tracking.create('one',{targetUrl:'https://shop.test'});
  await assert.rejects(bio.save('two',{slug:'other',title:'Other',links:[{trackedLinkId:link.id,label:'Shop',position:0}]}),/BIO_LINK_NOT_FOUND/);
  await bio.save('one',{slug:'shop',title:'Shop',links:[]});
  await assert.rejects(bio.save('two',{slug:'shop',title:'Other',links:[]}),/BIO_SLUG_TAKEN/);
});
