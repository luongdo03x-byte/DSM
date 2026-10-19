import {MemoryStore} from '../../../../packages/shared/src/store.ts';
import {MemoryRepositories} from '../../../../packages/shared/src/memory-repositories.ts';
import type {Repositories} from '../../../../packages/shared/src/repositories.ts';
import {createPrismaClient} from '../../../../packages/database/src/client.ts';
import {PrismaRepositories} from '../../../../packages/database/src/prisma-repositories.ts';
import {BullJobQueue} from '../../../worker/src/queue/bull-job-queue.ts';
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
import {MetaGraphClient} from '../integrations/meta/meta-http.client.ts';
import {MetaOAuthConnector} from '../integrations/meta/meta-oauth.service.ts';
import {MetaTokenRefreshService} from '../integrations/meta/meta-token-refresh.service.ts';
import {MetaDataDeletionService} from '../modules/integrations/meta-data-deletion.service.ts';
import {IntegrationsService} from '../modules/integrations/integrations.service.ts';
import {metaConfig} from '../integrations/meta/meta.config.ts';
import {FacebookAdapter} from '../integrations/meta/facebook.adapter.ts';
import {InstagramAdapter} from '../integrations/meta/instagram.adapter.ts';
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
import {FakePublisher} from '../../../worker/src/testing/fake-publisher.ts';

export interface DevelopmentRuntimeOptions{env?:Record<string,string|undefined>;hasher?:PasswordHasher;store?:MemoryStore}
export interface RuntimeOptions {env:Record<string,string|undefined>;hasher?:PasswordHasher;store?:MemoryStore}
function credentialKey(env:Record<string,string|undefined>){const raw=env.CREDENTIAL_ENCRYPTION_KEY;if(!raw)throw new Error('CREDENTIAL_ENCRYPTION_KEY_REQUIRED');const bytes=Buffer.from(raw,'base64');if(bytes.byteLength!==32)throw new Error('CREDENTIAL_ENCRYPTION_KEY_MUST_BE_32_BYTES');return new Uint8Array(bytes)}
function metaIntegrations(repos:Repositories,crypto:CredentialCryptoService,env:Record<string,string|undefined>){
  const config=metaConfig(env);if(!env.META_APP_ID||!env.META_APP_SECRET||!config.redirectUri||!config.stateSecret)return undefined;
  return new IntegrationsService({repos,crypto,meta:new MetaOAuthConnector({graph:new MetaGraphClient({baseUrl:config.graphBaseUrl,version:config.graphVersion}),appId:env.META_APP_ID,appSecret:env.META_APP_SECRET,redirectUri:config.redirectUri,...(env.META_AUTH_BASE_URL?{authBaseUrl:env.META_AUTH_BASE_URL}:{})}),stateSecret:config.stateSecret});
}
function metaTokenRefresher(repos:Repositories,crypto:CredentialCryptoService,env:Record<string,string|undefined>){
  const config=metaConfig(env);if(!env.META_APP_ID||!env.META_APP_SECRET||!config.redirectUri)return undefined;
  const connector=new MetaOAuthConnector({graph:new MetaGraphClient({baseUrl:config.graphBaseUrl,version:config.graphVersion}),appId:env.META_APP_ID,appSecret:env.META_APP_SECRET,redirectUri:config.redirectUri});
  return new MetaTokenRefreshService(repos,crypto,connector);
}
function metaDeletion(repos:Repositories,env:Record<string,string|undefined>){return env.META_APP_SECRET?new MetaDataDeletionService({repos,appSecret:env.META_APP_SECRET,statusBaseUrl:(env.WEB_APP_BASE_URL??'http://127.0.0.1:3000')+'/data-deletion'}):undefined}
export function registeredNodeKey(repos:Repositories, crypto:CredentialCryptoService) {return async (nodeId:string)=>{
  const node=await repos.browserNodes.get(nodeId);
  if(!node?.encryptedNodeKey)throw new Error('NODE_KEY_NOT_REGISTERED');
  return crypto.decrypt(JSON.parse(node.encryptedNodeKey),'browser-node:'+nodeId);
}}

export async function createDevelopmentRuntime(options:DevelopmentRuntimeOptions={}){
  const env=options.env??process.env,password=env.DEV_OWNER_PASSWORD;if(!password)throw new Error('DEV_OWNER_PASSWORD_REQUIRED');
  const hasher=options.hasher??new Node24Argon2idHasher(),store=options.store??new MemoryStore();
  const ownerId='local-owner',workspaceId='local-workspace',brandId='local-brand';
  if(!store.users.has(ownerId))store.users.set(ownerId,{id:ownerId,email:env.DEV_OWNER_EMAIL??'owner@local.test',passwordHash:await hasher.hash(password),status:'ACTIVE'});
  if(!store.workspaces.has(workspaceId))store.workspaces.set(workspaceId,{id:workspaceId,name:env.DEV_WORKSPACE_NAME??'Local Workspace'});
  if(!store.memberships.some(m=>m.workspaceId===workspaceId&&m.userId===ownerId))store.memberships.push({workspaceId,userId:ownerId,role:'OWNER'});
  if(!store.brands.has(brandId))store.brands.set(brandId,{id:brandId,workspaceId,name:env.DEV_BRAND_NAME??'Local Brand',slug:env.DEV_BRAND_SLUG??'local-brand',language:env.DEV_BRAND_LANGUAGE??'en',timezone:env.DEV_BRAND_TIMEZONE??'UTC',currency:env.DEV_BRAND_CURRENCY??'USD',status:'ACTIVE'});

  const repos=new MemoryRepositories(store);
  const credentialCrypto=new CredentialCryptoService(credentialKey(env)),accounts=new AccountsService(repos,credentialCrypto),nodeAuth=new NodeAuthService(repos,credentialCrypto),browserNodes=new BrowserNodesService(repos);
  const createdAccounts=new Map<string,Awaited<ReturnType<AccountsService['create']>>>();
  for(const platform of ['FACEBOOK','INSTAGRAM','THREADS','TIKTOK'] as const){const existing=(await repos.socialAccounts.findBy({brandId,platform}))[0];createdAccounts.set(platform,existing??await accounts.create(brandId,{platform,publishMode:'HYBRID'}))}
  const registry=new PublisherRegistry(),http=new FetchHttpClient(),metaHttp=new MetaHttpClient(http,metaConfig(env)),metaRefresh=metaTokenRefresher(repos,credentialCrypto,env);
  registry.register('FACEBOOK','API',new FacebookAdapter({graph:new MetaGraphClient({baseUrl:metaConfig(env).graphBaseUrl,version:metaConfig(env).graphVersion}),tokens:accountId=>accounts.getAccessToken(accountId),...(metaRefresh?{refresh:account=>metaRefresh.refresh(account)}:{})}));registry.register('INSTAGRAM','API',new InstagramAdapter({graph:new MetaGraphClient({baseUrl:metaConfig(env).graphBaseUrl,version:metaConfig(env).graphVersion}),tokens:accountId=>accounts.getAccessToken(accountId),accountIds:async accountId=>(await repos.socialAccounts.get(accountId))?.platformAccountId??accountId,...(metaRefresh?{refresh:account=>metaRefresh.refresh(account)}:{})}));registry.register('THREADS','API',new ThreadsPublisher(metaHttp,accounts));
  const tc=tiktokConfig(env),th=new TikTokHttpClient(http,tc),creator=new TikTokCreatorInfoService(th,accounts),status=new TikTokStatusService(th,accounts),upload=new TikTokUploadService(th);
  registry.register('TIKTOK','API',new TikTokPublisher(th,accounts,new TikTokValidation(creator,tc),status,upload,tc));

  const browserNodeKey=env.BROWSER_NODE_KEY,browserHost=env.BROWSER_GATEWAY_HOST,browserPort=Number(env.BROWSER_GATEWAY_PORT??4010);
  if(browserNodeKey&&browserHost){
    const nodeId='local-browser-node';store.browserNodes.set(nodeId,{id:nodeId,workspaceId,name:'Local Browser Node',host:browserHost,port:browserPort,status:'ONLINE',provider:'GPMLOGIN',lastSeenAt:Date.now(),maxConcurrency:Number(env.BROWSER_MAX_CONCURRENCY??2)});
    const browserClient=new BrowserGatewayClient(async()=>browserNodeKey);
    const profileEnv:Record<string,string|undefined>={FACEBOOK:env.FACEBOOK_GPM_PROFILE_ID,INSTAGRAM:env.INSTAGRAM_GPM_PROFILE_ID,THREADS:env.THREADS_GPM_PROFILE_ID,TIKTOK:env.TIKTOK_GPM_PROFILE_ID};
    for(const platform of ['FACEBOOK','INSTAGRAM','THREADS','TIKTOK'] as const){const account=createdAccounts.get(platform),providerProfileId=profileEnv[platform];if(!account||!providerProfileId)continue;const profileId=`browser-profile-${platform.toLowerCase()}`;await repos.browserProfiles.insert({id:profileId,brandId,browserNodeId:nodeId,provider:'GPMLOGIN',providerProfileId,name:`${platform} local profile`,status:'READY',socialAccountId:account.id});await repos.socialAccounts.update(account.id,{browserProfileId:profileId});registry.register(platform,'BROWSER',new BrowserPublisherProxy(platform,repos,browserClient))}
  }

  const storage=env.S3_ENDPOINT&&env.S3_REGION&&env.S3_ACCESS_KEY&&env.S3_SECRET_KEY&&env.S3_BUCKET?new S3CompatibleObjectStorage({endpoint:env.S3_ENDPOINT,region:env.S3_REGION,accessKey:env.S3_ACCESS_KEY,secretKey:env.S3_SECRET_KEY,bucket:env.S3_BUCKET}):new InMemoryObjectStorage();
  const analytics=new AnalyticsService(repos),products=new ProductsService(repos),content=new ContentService(repos),batchStatus=new BatchStatusService(repos),tracking=new TrackingService(repos),media=new MediaService(repos,storage),campaigns=new CampaignsService(repos);
  const integrations=metaIntegrations(repos,credentialCrypto,env);
  const dataDeletion=metaDeletion(repos,env);
  const runtime=new LocalApiRuntime({repos,auth:new AuthService(repos,hasher,env.JWT_ACCESS_SECRET??'development-only-access-secret'),brandAccess:new BrandAccessService(repos),products,content,accounts,publishing:new PublishingService(repos,registry,new StrategyResolver()),batchStatus,analytics,tracking,media,campaigns,campaignPerformance:new CampaignPerformanceService(repos,analytics),nodeAuth,browserNodes,webAppBaseUrl:env.WEB_APP_BASE_URL??'http://127.0.0.1:3000',...(integrations?{integrations}:{}),...(dataDeletion?{dataDeletion}:{})});
  return{store,repos,runtime,registry,services:{accounts,products,content,batchStatus,analytics,tracking,media,campaigns,nodeAuth,browserNodes},ids:{ownerId,workspaceId,brandId}};
}

export async function createRuntime(options:RuntimeOptions) {
  const env=options.env;
  if(env.E2E_FAKE_PUBLISHERS==='1'&&env.APP_ENV!=='test')throw new Error('E2E_FAKE_PUBLISHERS_REQUIRES_TEST_ENV');
  const mode=env.RUNTIME_STORE??(env.DEV_IN_MEMORY==='1'?'memory':'postgres');
  if(mode==='memory'){
    if(env.APP_ENV==='production')throw new Error('DEV_IN_MEMORY_FORBIDDEN_IN_PRODUCTION');
    const app=await createDevelopmentRuntime(options);
    if(env.E2E_FAKE_PUBLISHERS==='1')for(const platform of ['FACEBOOK','INSTAGRAM'] as const){
      const account=(await app.repos.socialAccounts.findBy({brandId:app.ids.brandId,platform}))[0];
      if(account)await app.repos.socialAccounts.update(account.id,{status:'CONNECTED'});
      app.registry.register(platform,'API',new FakePublisher());
    }
    return {...app,close:async()=>{}};
  }
  if(mode!=='postgres')throw new Error('RUNTIME_STORE_INVALID');
  if(!env.DATABASE_URL)throw new Error('DATABASE_URL_REQUIRED');
  if(!env.REDIS_URL)throw new Error('REDIS_URL_REQUIRED');
  const client=createPrismaClient(env.DATABASE_URL);
  let queue:BullJobQueue|undefined;
  try {
    await client.$connect();
    queue=new BullJobQueue({url:env.REDIS_URL},env.PUBLISH_QUEUE_NAME);
    const repos:Repositories=new PrismaRepositories(client);
    const hasher=options.hasher??new Node24Argon2idHasher();
    const ids={ownerId:'local-owner',workspaceId:'local-workspace',brandId:'local-brand'};
    if(env.DEV_SEED==='1'){
      if(!env.DEV_OWNER_PASSWORD)throw new Error('DEV_OWNER_PASSWORD_REQUIRED');
      if(!await repos.users.get(ids.ownerId))await repos.users.insert({id:ids.ownerId,email:env.DEV_OWNER_EMAIL??'owner@local.test',passwordHash:await hasher.hash(env.DEV_OWNER_PASSWORD),status:'ACTIVE'});
      if(!await repos.workspaces.get(ids.workspaceId))await repos.workspaces.insert({id:ids.workspaceId,name:env.DEV_WORKSPACE_NAME??'Local Workspace'});
      if(!(await repos.memberships.findBy({workspaceId:ids.workspaceId,userId:ids.ownerId})).length)await repos.memberships.append({workspaceId:ids.workspaceId,userId:ids.ownerId,role:'OWNER'});
      if(!await repos.brands.get(ids.brandId))await repos.brands.insert({id:ids.brandId,workspaceId:ids.workspaceId,name:env.DEV_BRAND_NAME??'Local Brand',slug:env.DEV_BRAND_SLUG??'local-brand',language:env.DEV_BRAND_LANGUAGE??'en',timezone:env.DEV_BRAND_TIMEZONE??'UTC',currency:env.DEV_BRAND_CURRENCY??'USD',status:'ACTIVE'});
    }
    const credentialCrypto=new CredentialCryptoService(credentialKey(env));
    const accounts=new AccountsService(repos,credentialCrypto),nodeAuth=new NodeAuthService(repos,credentialCrypto),browserNodes=new BrowserNodesService(repos);
    const registry=new PublisherRegistry(),http=new FetchHttpClient(),metaHttp=new MetaHttpClient(http,metaConfig(env)),metaRefresh=metaTokenRefresher(repos,credentialCrypto,env);
    registry.register('FACEBOOK','API',new FacebookAdapter({graph:new MetaGraphClient({baseUrl:metaConfig(env).graphBaseUrl,version:metaConfig(env).graphVersion}),tokens:accountId=>accounts.getAccessToken(accountId),...(metaRefresh?{refresh:account=>metaRefresh.refresh(account)}:{})}));
    registry.register('INSTAGRAM','API',new InstagramAdapter({graph:new MetaGraphClient({baseUrl:metaConfig(env).graphBaseUrl,version:metaConfig(env).graphVersion}),tokens:accountId=>accounts.getAccessToken(accountId),accountIds:async accountId=>(await repos.socialAccounts.get(accountId))?.platformAccountId??accountId,...(metaRefresh?{refresh:account=>metaRefresh.refresh(account)}:{})}));
    registry.register('THREADS','API',new ThreadsPublisher(metaHttp,accounts));
    const tc=tiktokConfig(env),th=new TikTokHttpClient(http,tc),creator=new TikTokCreatorInfoService(th,accounts),status=new TikTokStatusService(th,accounts),upload=new TikTokUploadService(th);
    registry.register('TIKTOK','API',new TikTokPublisher(th,accounts,new TikTokValidation(creator,tc),status,upload,tc));
    const browserClient=new BrowserGatewayClient(registeredNodeKey(repos,credentialCrypto));
    for(const platform of ['FACEBOOK','INSTAGRAM','THREADS','TIKTOK'] as const)registry.register(platform,'BROWSER',new BrowserPublisherProxy(platform,repos,browserClient));
    const storage=env.S3_ENDPOINT&&env.S3_REGION&&env.S3_ACCESS_KEY&&env.S3_SECRET_KEY&&env.S3_BUCKET?new S3CompatibleObjectStorage({endpoint:env.S3_ENDPOINT,region:env.S3_REGION,accessKey:env.S3_ACCESS_KEY,secretKey:env.S3_SECRET_KEY,bucket:env.S3_BUCKET}):new InMemoryObjectStorage();
    const analytics=new AnalyticsService(repos),products=new ProductsService(repos),content=new ContentService(repos),batchStatus=new BatchStatusService(repos,undefined,queue),tracking=new TrackingService(repos),media=new MediaService(repos,storage),campaigns=new CampaignsService(repos);
    const integrations=metaIntegrations(repos,credentialCrypto,env);
    const dataDeletion=metaDeletion(repos,env);
    const runtime=new LocalApiRuntime({repos,auth:new AuthService(repos,hasher,env.JWT_ACCESS_SECRET??'development-only-access-secret'),brandAccess:new BrandAccessService(repos),products,content,accounts,publishing:new PublishingService(repos,registry,new StrategyResolver(),queue),batchStatus,analytics,tracking,media,campaigns,campaignPerformance:new CampaignPerformanceService(repos,analytics),nodeAuth,browserNodes,webAppBaseUrl:env.WEB_APP_BASE_URL??'http://127.0.0.1:3000',...(integrations?{integrations}:{}),...(dataDeletion?{dataDeletion}:{})});
    return {repos,runtime,registry,queue,services:{accounts,products,content,batchStatus,analytics,tracking,media,campaigns,nodeAuth,browserNodes},ids,close:async()=>{await queue!.close();await client.$disconnect()}};
  } catch(error) {if(queue)await queue.close();await client.$disconnect();throw error}
}
