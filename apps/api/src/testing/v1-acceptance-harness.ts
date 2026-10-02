import {MemoryStore} from '../../../../packages/shared/src/store.ts';
import {AuthService} from '../modules/auth/auth.service.ts';
import {ProductsService} from '../modules/products/products.service.ts';
import {MediaService,InMemoryObjectStorage} from '../modules/media/media.service.ts';
import {ContentService} from '../modules/content/content.service.ts';
import {AccountsService} from '../modules/accounts/accounts.service.ts';
import {CredentialCryptoService} from '../modules/accounts/credential-crypto.service.ts';
import {PublisherRegistry} from '../modules/publishing/publisher-registry.ts';
import {StrategyResolver} from '../modules/publishing/strategy-resolver.ts';
import {PublishingService} from '../modules/publishing/publishing.service.ts';
import {BatchStatusService} from '../modules/publishing/batch-status.service.ts';
import {TrackingService} from '../modules/tracking/tracking.service.ts';
import {AnalyticsService} from '../modules/analytics/analytics.service.ts';
import {FakePublisher} from '../../../worker/src/testing/fake-publisher.ts';
import {JobRunner} from '../../../worker/src/publishing/job-runner.service.ts';
import {MetricsSyncService} from '../../../worker/src/analytics/metrics-sync.service.ts';

export async function runV1CriticalJourney(){
  const s=new MemoryStore();s.workspaces.set('w',{id:'w',name:'Workspace'});s.memberships.push({workspaceId:'w',userId:'u',role:'OWNER'});s.brands.set('b',{id:'b',workspaceId:'w',name:'PawJoy',slug:'pawjoy',language:'en',timezone:'UTC',currency:'USD',status:'ACTIVE'});s.users.set('u',{id:'u',email:'owner@test',passwordHash:'hash',status:'ACTIVE'});
  const auth=new AuthService(s,{hash:async x=>x,verify:async()=>true},'secret');const login=await auth.login('owner@test','pw');
  const products=new ProductsService(s),product=products.create('b',{name:'Dog Brush',slug:'dog-brush',currency:'USD',landingUrl:'https://shop.test/dog-brush',cost:'8',sellingPrice:'29'});
  const media=new MediaService(s,new InMemoryObjectStorage()),upload=await media.createUpload({workspaceId:'w',brandId:'b'},{type:'VIDEO',mimeType:'video/mp4'});
  const contentSvc=new ContentService(s),content=contentSvc.create('b',{type:'VIDEO',title:'Dog brush demo',productId:product.id,body:'Demo',masterAssetId:upload.assetId});const variants=contentSvc.copyMasterToAll('b',content.id);for(const v of variants)v.status='READY';
  const accounts=new AccountsService(s,new CredentialCryptoService(new Uint8Array(32).fill(8)));for(const platform of ['FACEBOOK','TIKTOK','INSTAGRAM','THREADS'] as const){const a=accounts.create('b',{platform,publishMode:'API'});a.status='CONNECTED'}
  const registry=new PublisherRegistry();const publishers=new Map<string,FakePublisher>();for(const platform of ['FACEBOOK','TIKTOK','INSTAGRAM','THREADS'] as const){const p=new FakePublisher();publishers.set(platform,p);registry.register(platform,'API',p)}
  const publishing=new PublishingService(s,registry,new StrategyResolver());const accountIds=[...s.socialAccounts.keys()];const batch=await publishing.createBatch({brandId:'b',contentId:content.id,createdBy:'u',socialAccountIds:accountIds});
  const runner=new JobRunner(s,registry);for(const r of batch.results){const jobId=(r as {jobId?:string}).jobId;if(r.valid&&jobId)await runner.run(jobId,j=>{const v=s.variants.get(j.contentVariantId)!;return{brandId:'b',socialAccountId:j.socialAccountId,contentVariantId:j.contentVariantId,platform:j.platform,contentType:'VIDEO' as const,...(v.caption?{caption:v.caption}:{}),mediaUrl:upload.uploadUrl}})}
  const tracking=new TrackingService(s),link=tracking.create('b',{targetUrl:'https://shop.test/dog-brush',productId:product.id,contentItemId:content.id,utmSource:'social'});const firstPost=[...s.publishedPosts.values()][0]!;tracking.bindToPublishedPost('b',link.id,firstPost.id);const redirect=tracking.resolve(link.code,{deviceType:'desktop'});
  const sync=new MetricsSyncService(s,registry);for(const p of s.publishedPosts.values())await sync.sync(p.id,`acceptance:${p.id}`,Date.now());
  const analytics=new AnalyticsService(s).overview('b');return{loginOk:!!login.accessToken,variants:variants.length,jobs:s.publishJobs.size,batchStatus:new BatchStatusService(s).get(batch.batchId),publishedPosts:s.publishedPosts.size,redirect,analytics};
}
