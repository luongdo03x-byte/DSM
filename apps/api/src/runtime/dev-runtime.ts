import {MemoryStore} from '../../../../packages/shared/src/store.ts';
import {FetchHttpClient} from '../../../../packages/shared/src/http.ts';
import type {PasswordHasher} from '../modules/auth/auth.service.ts';
import {AuthService,Node24Argon2idHasher} from '../modules/auth/auth.service.ts';
import {BrandAccessService} from '../modules/identity/brand-access.service.ts';
import {ProductsService} from '../modules/products/products.service.ts';
import {ContentService} from '../modules/content/content.service.ts';
import {AccountsService} from '../modules/accounts/accounts.service.ts';
import {CredentialCryptoService} from '../modules/accounts/credential-crypto.service.ts';
import {MediaService,InMemoryObjectStorage} from '../modules/media/media.service.ts';
import {S3CompatibleObjectStorage} from '../modules/media/s3-object-storage.ts';
import {CampaignsService} from '../modules/campaigns/campaigns.service.ts';
import {CampaignPerformanceService} from '../modules/campaigns/campaign-performance.service.ts';
import {PublisherRegistry} from '../modules/publishing/publisher-registry.ts';
import {StrategyResolver} from '../modules/publishing/strategy-resolver.ts';
import {PublishingService} from '../modules/publishing/publishing.service.ts';
import {BatchStatusService} from '../modules/publishing/batch-status.service.ts';
import {AnalyticsService} from '../modules/analytics/analytics.service.ts';
import {TrackingService} from '../modules/tracking/tracking.service.ts';
import {LocalApiRuntime} from './local-api.ts';
import {MetaHttpClient} from '../integrations/meta/meta-http.client.ts';
import {metaConfig} from '../integrations/meta/meta.config.ts';
import {FacebookPublisher} from '../modules/publishing/platforms/facebook/facebook.publisher.ts';
import {InstagramPublisher} from '../modules/publishing/platforms/instagram/instagram.publisher.ts';
import {ThreadsPublisher} from '../modules/publishing/platforms/threads/threads.publisher.ts';
import {TikTokHttpClient} from '../integrations/tiktok/tiktok-http.client.ts';
import {tiktokConfig} from '../integrations/tiktok/tiktok.config.ts';
import {TikTokCreatorInfoService} from '../modules/publishing/platforms/tiktok/tiktok.creator-info.ts';
import {TikTokValidation} from '../modules/publishing/platforms/tiktok/tiktok.validation.ts';
import {TikTokStatusService} from '../modules/publishing/platforms/tiktok/tiktok-status.service.ts';
import {TikTokUploadService} from '../modules/publishing/platforms/tiktok/tiktok-upload.service.ts';
import {TikTokPublisher} from '../modules/publishing/platforms/tiktok/tiktok.publisher.ts';
import {BrowserGatewayClient} from '../modules/browser-nodes/browser-gateway.client.ts';
import {BrowserPublisherProxy} from '../modules/publishing/browser-publisher.proxy.ts';
import {NodeAuthService} from '../modules/browser-nodes/node-auth.service.ts';
import {BrowserNodesService} from '../modules/browser-nodes/browser-nodes.service.ts';

export interface DevelopmentRuntimeOptions{env?:Record<string,string|undefined>;hasher?:PasswordHasher;store?:MemoryStore}
function credentialKey(env:Record<string,string|undefined>){const raw=env.CREDENTIAL_ENCRYPTION_KEY;if(!raw)throw new Error('CREDENTIAL_ENCRYPTION_KEY_REQUIRED');const bytes=Buffer.from(raw,'base64');if(bytes.byteLength!==32)throw new Error('CREDENTIAL_ENCRYPTION_KEY_MUST_BE_32_BYTES');return new Uint8Array(bytes)}

export async function createDevelopmentRuntime(options:DevelopmentRuntimeOptions={}){
  const env=options.env??process.env,password=env.DEV_OWNER_PASSWORD;if(!password)throw new Error('DEV_OWNER_PASSWORD_REQUIRED');
  const hasher=options.hasher??new Node24Argon2idHasher(),store=options.store??new MemoryStore();
  const ownerId='local-owner',workspaceId='local-workspace',brandId='local-brand';
  if(!store.users.has(ownerId))store.users.set(ownerId,{id:ownerId,email:env.DEV_OWNER_EMAIL??'owner@local.test',passwordHash:await hasher.hash(password),status:'ACTIVE'});
  if(!store.workspaces.has(workspaceId))store.workspaces.set(workspaceId,{id:workspaceId,name:env.DEV_WORKSPACE_NAME??'Local Workspace'});
  if(!store.memberships.some(m=>m.workspaceId===workspaceId&&m.userId===ownerId))store.memberships.push({workspaceId,userId:ownerId,role:'OWNER'});
  if(!store.brands.has(brandId))store.brands.set(brandId,{id:brandId,workspaceId,name:env.DEV_BRAND_NAME??'Local Brand',slug:env.DEV_BRAND_SLUG??'local-brand',language:env.DEV_BRAND_LANGUAGE??'en',timezone:env.DEV_BRAND_TIMEZONE??'UTC',currency:env.DEV_BRAND_CURRENCY??'USD',status:'ACTIVE'});

  const credentialCrypto=new CredentialCryptoService(credentialKey(env)),accounts=new AccountsService(store,credentialCrypto),nodeAuth=new NodeAuthService(store,credentialCrypto),browserNodes=new BrowserNodesService(store);
  const createdAccounts=new Map<string,ReturnType<AccountsService['create']>>();
  for(const platform of ['FACEBOOK','INSTAGRAM','THREADS','TIKTOK'] as const){const existing=[...store.socialAccounts.values()].find(a=>a.brandId===brandId&&a.platform===platform);createdAccounts.set(platform,existing??accounts.create(brandId,{platform,publishMode:'HYBRID'}))}
  const registry=new PublisherRegistry(),http=new FetchHttpClient(),metaHttp=new MetaHttpClient(http,metaConfig(env));
  registry.register('FACEBOOK','API',new FacebookPublisher(metaHttp,accounts));registry.register('INSTAGRAM','API',new InstagramPublisher(metaHttp,accounts));registry.register('THREADS','API',new ThreadsPublisher(metaHttp,accounts));
  const tc=tiktokConfig(env),th=new TikTokHttpClient(http,tc),creator=new TikTokCreatorInfoService(th,accounts),status=new TikTokStatusService(th,accounts),upload=new TikTokUploadService(th);
  registry.register('TIKTOK','API',new TikTokPublisher(th,accounts,new TikTokValidation(creator,tc),status,upload,tc));

  const browserNodeKey=env.BROWSER_NODE_KEY,browserHost=env.BROWSER_GATEWAY_HOST,browserPort=Number(env.BROWSER_GATEWAY_PORT??4010);
  if(browserNodeKey&&browserHost){
    const nodeId='local-browser-node';store.browserNodes.set(nodeId,{id:nodeId,workspaceId,name:'Local Browser Node',host:browserHost,port:browserPort,status:'ONLINE',provider:'GPMLOGIN',lastSeenAt:Date.now(),maxConcurrency:Number(env.BROWSER_MAX_CONCURRENCY??2)});
    const browserClient=new BrowserGatewayClient(async()=>browserNodeKey);
    const profileEnv:Record<string,string|undefined>={FACEBOOK:env.FACEBOOK_GPM_PROFILE_ID,INSTAGRAM:env.INSTAGRAM_GPM_PROFILE_ID,THREADS:env.THREADS_GPM_PROFILE_ID,TIKTOK:env.TIKTOK_GPM_PROFILE_ID};
    for(const platform of ['FACEBOOK','INSTAGRAM','THREADS','TIKTOK'] as const){const account=createdAccounts.get(platform),providerProfileId=profileEnv[platform];if(!account||!providerProfileId)continue;const profileId=`browser-profile-${platform.toLowerCase()}`;store.browserProfiles.set(profileId,{id:profileId,brandId,browserNodeId:nodeId,provider:'GPMLOGIN',providerProfileId,name:`${platform} local profile`,status:'READY',socialAccountId:account.id});account.browserProfileId=profileId;registry.register(platform,'BROWSER',new BrowserPublisherProxy(platform,store,browserClient))}
  }

  const storage=env.S3_ENDPOINT&&env.S3_REGION&&env.S3_ACCESS_KEY&&env.S3_SECRET_KEY&&env.S3_BUCKET?new S3CompatibleObjectStorage({endpoint:env.S3_ENDPOINT,region:env.S3_REGION,accessKey:env.S3_ACCESS_KEY,secretKey:env.S3_SECRET_KEY,bucket:env.S3_BUCKET}):new InMemoryObjectStorage();
  const analytics=new AnalyticsService(store),products=new ProductsService(store),content=new ContentService(store),batchStatus=new BatchStatusService(store),tracking=new TrackingService(store),media=new MediaService(store,storage),campaigns=new CampaignsService(store);
  const runtime=new LocalApiRuntime({store,auth:new AuthService(store,hasher,env.JWT_ACCESS_SECRET??'development-only-access-secret'),brandAccess:new BrandAccessService(store),products,content,accounts,publishing:new PublishingService(store,registry,new StrategyResolver()),batchStatus,analytics,tracking,media,campaigns,campaignPerformance:new CampaignPerformanceService(store,analytics),nodeAuth,browserNodes});
  return{store,runtime,registry,services:{accounts,products,content,batchStatus,analytics,tracking,media,campaigns,nodeAuth,browserNodes},ids:{ownerId,workspaceId,brandId}};
}
