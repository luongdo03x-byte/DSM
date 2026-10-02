import type {MemoryStore} from '../../../../packages/shared/src/store.ts';
import type {AuthService} from '../modules/auth/auth.service.ts';
import type {BrandAccessService} from '../modules/identity/brand-access.service.ts';
import type {ProductsService} from '../modules/products/products.service.ts';
import type {ContentService} from '../modules/content/content.service.ts';
import type {AccountsService} from '../modules/accounts/accounts.service.ts';
import type {PublishingService} from '../modules/publishing/publishing.service.ts';
import type {BatchStatusService} from '../modules/publishing/batch-status.service.ts';
import type {AnalyticsService} from '../modules/analytics/analytics.service.ts';
import type {TrackingService} from '../modules/tracking/tracking.service.ts';
import type {MediaService} from '../modules/media/media.service.ts';
import type {CampaignsService} from '../modules/campaigns/campaigns.service.ts';
import type {CampaignPerformanceService} from '../modules/campaigns/campaign-performance.service.ts';
import type {NodeAuthService} from '../modules/browser-nodes/node-auth.service.ts';
import type {BrowserNodesService} from '../modules/browser-nodes/browser-nodes.service.ts';

export interface LocalRequest {
  method: string;
  path: string;
  headers?: Record<string,string>;
  body?: unknown;
}
export interface LocalResponse {
  status: number;
  body: unknown;
  headers?: Record<string,string>;
}

type Dependencies={
  store:MemoryStore;
  auth:AuthService;
  brandAccess:BrandAccessService;
  products:ProductsService;
  content:ContentService;
  accounts:AccountsService;
  publishing:PublishingService;
  batchStatus:BatchStatusService;
  analytics:AnalyticsService;
  tracking:TrackingService;
  media?:MediaService;
  campaigns?:CampaignsService;
  campaignPerformance?:CampaignPerformanceService;
  nodeAuth?:NodeAuthService;
  browserNodes?:BrowserNodesService;
};

function asObject(value:unknown):Record<string,any>{
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('INVALID_BODY');
  return value as Record<string,any>;
}
function route(path:string,pattern:RegExp){return pattern.exec(path)}

export class LocalApiRuntime {
  private d:Dependencies;
  constructor(d:Dependencies){this.d=d}

  async handle(req:LocalRequest):Promise<LocalResponse>{
    const method=req.method.toUpperCase();
    try {
      if(method==='POST'&&req.path==='/auth/login'){
        const body=asObject(req.body);
        const result=await this.d.auth.login(String(body.email??''),String(body.password??''));
        return{status:200,body:result};
      }
      if(method==='POST'&&req.path==='/auth/refresh'){
        const body=asObject(req.body);
        const result=await this.d.auth.refresh(String(body.refreshToken??''));
        return{status:200,body:result};
      }
      if(method==='POST'&&req.path==='/auth/logout'){
        const body=asObject(req.body);
        await this.d.auth.logout(String(body.refreshToken??''));
        return{status:204,body:null};
      }
      if(method==='GET'&&req.path==='/auth/me'){
        const userId=await this.authenticate(req);
        const user=this.d.store.users.get(userId);if(!user)throw new Error('UNAUTHORIZED');
        return{status:200,body:{id:user.id,email:user.email}};
      }
      if(method==='GET'&&req.path==='/auth/context'){
        const userId=await this.authenticate(req);const memberships=this.d.store.memberships.filter(x=>x.userId===userId);const workspaceIds=new Set(memberships.map(x=>x.workspaceId));const workspaces=[...this.d.store.workspaces.values()].filter(x=>workspaceIds.has(x.id));const brands=[...this.d.store.brands.values()].filter(x=>workspaceIds.has(x.workspaceId));return{status:200,body:{workspaces,brands,memberships}};
      }
      let publicMatch:RegExpExecArray|null;
      if(method==='GET'&&(publicMatch=route(req.path,/^\/r\/([^/]+)$/))){
        const referrer=req.headers?.referer,userAgent=req.headers?.['user-agent'];const target=this.d.tracking.resolve(decodeURIComponent(publicMatch[1]!),{...(referrer?{referrer}:{}),...(userAgent?{userAgent}:{})});
        return{status:302,body:null,headers:{location:target}};
      }

      let nodeMatch:RegExpExecArray|null;
      if(method==='POST'&&(nodeMatch=route(req.path,/^\/browser-nodes\/([^/]+)\/register$/))){if(!this.d.nodeAuth)return{status:501,body:{error:'NODE_AUTH_NOT_CONFIGURED'}};const b=asObject(req.body);return{status:200,body:await this.d.nodeAuth.register(decodeURIComponent(nodeMatch[1]!),String(b.registrationToken??''))}}
      if(method==='POST'&&(nodeMatch=route(req.path,/^\/browser-nodes\/([^/]+)\/heartbeat$/))){if(!this.d.nodeAuth||!this.d.browserNodes)return{status:501,body:{error:'NODE_AUTH_NOT_CONFIGURED'}};const nodeId=decodeURIComponent(nodeMatch[1]!),timestamp=req.headers?.['x-node-ts']??'',signature=req.headers?.['x-node-signature']??'',body=asObject(req.body),raw=JSON.stringify(body);await this.d.nodeAuth.verify({nodeId,timestamp,method,path:req.path,body:raw,signature});return{status:200,body:this.d.browserNodes.heartbeat(nodeId,{status:body.status==='DEGRADED'?'DEGRADED':'ONLINE',...(body.maxConcurrency!==undefined?{maxConcurrency:Number(body.maxConcurrency)}:{})})}}

      const userId=await this.authenticate(req);
      let m:RegExpExecArray|null;

      if(method==='POST'&&req.path==='/browser-nodes/registration'){
        if(!this.d.nodeAuth)return{status:501,body:{error:'NODE_AUTH_NOT_CONFIGURED'}};const b=asObject(req.body),workspaceId=String(b.workspaceId??this.d.store.memberships.find(x=>x.userId===userId)?.workspaceId??'');if(!workspaceId||!this.d.store.memberships.some(x=>x.userId===userId&&x.workspaceId===workspaceId))throw new Error('BRAND_NOT_FOUND');return{status:201,body:await this.d.nodeAuth.createRegistration(workspaceId,String(b.name??'Browser Node'),String(b.host??'127.0.0.1'),Number(b.port??4010))}
      }

      if((m=route(req.path,/^\/brands\/([^/]+)$/))){
        const brandId=decodeURIComponent(m[1]!);this.authorize(userId,brandId);
        if(method==='GET')return{status:200,body:this.d.store.brands.get(brandId)};
      }

      if((m=route(req.path,/^\/brands\/([^/]+)\/accounts$/))){
        const brandId=decodeURIComponent(m[1]!);this.authorize(userId,brandId);
        if(method==='GET')return{status:200,body:this.d.accounts.list(brandId)};
        if(method==='POST'){const b=asObject(req.body);return{status:201,body:this.d.accounts.create(brandId,{platform:b.platform,username:b.username,publishMode:b.publishMode})}}
      }
      if((m=route(req.path,/^\/brands\/([^/]+)\/accounts\/([^/]+)\/credentials$/))){
        const brandId=decodeURIComponent(m[1]!),accountId=decodeURIComponent(m[2]!);this.authorize(userId,brandId);const account=this.d.store.socialAccounts.get(accountId);if(!account||account.brandId!==brandId)throw new Error('ACCOUNT_NOT_FOUND');if(method==='POST'){const b=asObject(req.body);await this.d.accounts.saveCredential(accountId,String(b.provider??account.platform.toLowerCase()),String(b.accessToken??''),b.refreshToken!==undefined?String(b.refreshToken):undefined);return{status:200,body:{id:account.id,status:account.status}}}
      }
      if((m=route(req.path,/^\/brands\/([^/]+)\/accounts\/([^/]+)\/browser-profile$/))){
        const brandId=decodeURIComponent(m[1]!),accountId=decodeURIComponent(m[2]!);this.authorize(userId,brandId);if(method==='POST'){const b=asObject(req.body);return{status:200,body:this.d.accounts.attachBrowserProfile(brandId,accountId,String(b.browserNodeId??''),String(b.providerProfileId??''),String(b.name??'Browser profile'))}}
      }
      if((m=route(req.path,/^\/brands\/([^/]+)\/accounts\/([^/]+)\/disconnect$/))){
        const brandId=decodeURIComponent(m[1]!),accountId=decodeURIComponent(m[2]!);this.authorize(userId,brandId);
        if(method==='POST')return{status:200,body:this.d.accounts.disconnect(brandId,accountId,userId)};
      }
      if((m=route(req.path,/^\/brands\/([^/]+)\/browser-nodes$/))){
        const brandId=decodeURIComponent(m[1]!);const access=this.authorize(userId,brandId);if(method==='GET')return{status:200,body:[...this.d.store.browserNodes.values()].filter(x=>x.workspaceId===access.workspaceId)};
      }

      if((m=route(req.path,/^\/brands\/([^/]+)\/media\/uploads$/))){
        const brandId=decodeURIComponent(m[1]!);const access=this.authorize(userId,brandId);
        if(method==='POST'){if(!this.d.media)return{status:501,body:{error:'MEDIA_NOT_CONFIGURED'}};const b=asObject(req.body);return{status:201,body:await this.d.media.createUpload({workspaceId:access.workspaceId,brandId},{type:b.type,mimeType:String(b.mimeType??''),...(b.category!==undefined?{category:String(b.category)}:{})})}}
      }

      if((m=route(req.path,/^\/brands\/([^/]+)\/products\/([^/]+)\/archive$/))){
        const brandId=decodeURIComponent(m[1]!),productId=decodeURIComponent(m[2]!);this.authorize(userId,brandId);
        if(method==='POST')return{status:200,body:this.d.products.archive(brandId,productId,userId)};
      }

      if((m=route(req.path,/^\/brands\/([^/]+)\/campaigns$/))){
        const brandId=decodeURIComponent(m[1]!);this.authorize(userId,brandId);
        if(method==='GET')return{status:200,body:[...this.d.store.campaigns.values()].filter(x=>x.brandId===brandId)};
        if(method==='POST'){if(!this.d.campaigns)return{status:501,body:{error:'CAMPAIGNS_NOT_CONFIGURED'}};const b=asObject(req.body);return{status:201,body:this.d.campaigns.create(brandId,{name:String(b.name??''),...(b.productId!==undefined?{productId:String(b.productId)}:{}),...(b.description!==undefined?{description:String(b.description)}:{})})}}
      }
      if((m=route(req.path,/^\/brands\/([^/]+)\/campaigns\/([^/]+)\/content$/))){
        const brandId=decodeURIComponent(m[1]!),campaignId=decodeURIComponent(m[2]!);this.authorize(userId,brandId);
        if(method==='POST'){if(!this.d.campaigns)return{status:501,body:{error:'CAMPAIGNS_NOT_CONFIGURED'}};const b=asObject(req.body);return{status:200,body:this.d.campaigns.attachContent(brandId,campaignId,String(b.contentId??''))}}
      }
      if((m=route(req.path,/^\/brands\/([^/]+)\/campaigns\/([^/]+)\/performance$/))){
        const brandId=decodeURIComponent(m[1]!),campaignId=decodeURIComponent(m[2]!);this.authorize(userId,brandId);
        if(method==='GET'){if(!this.d.campaignPerformance)return{status:501,body:{error:'CAMPAIGN_PERFORMANCE_NOT_CONFIGURED'}};return{status:200,body:this.d.campaignPerformance.get(brandId,campaignId)}}
      }

      if((m=route(req.path,/^\/brands\/([^/]+)\/tracked-links$/))){
        const brandId=decodeURIComponent(m[1]!);this.authorize(userId,brandId);
        if(method==='POST'){const b=asObject(req.body);return{status:201,body:this.d.tracking.create(brandId,{targetUrl:String(b.targetUrl??''),...(b.productId!==undefined?{productId:String(b.productId)}:{}),...(b.contentItemId!==undefined?{contentItemId:String(b.contentItemId)}:{}),...(b.utmSource!==undefined?{utmSource:String(b.utmSource)}:{}),...(b.utmMedium!==undefined?{utmMedium:String(b.utmMedium)}:{}),...(b.utmCampaign!==undefined?{utmCampaign:String(b.utmCampaign)}:{}),...(b.utmContent!==undefined?{utmContent:String(b.utmContent)}:{})})}}
      }

      if((m=route(req.path,/^\/brands\/([^/]+)\/calendar$/))){
        const brandId=decodeURIComponent(m[1]!);this.authorize(userId,brandId);if(method==='GET')return{status:200,body:[...this.d.store.publishJobs.values()].filter(x=>x.brandId===brandId).sort((a,b)=>a.scheduledAt-b.scheduledAt)};
      }
      if((m=route(req.path,/^\/brands\/([^/]+)\/calendar\/([^/]+)$/))){
        const brandId=decodeURIComponent(m[1]!),jobId=decodeURIComponent(m[2]!);this.authorize(userId,brandId);const job=this.d.store.publishJobs.get(jobId);if(!job||job.brandId!==brandId)throw new Error('JOB_NOT_FOUND');
        if(method==='PATCH'){const b=asObject(req.body);return{status:200,body:this.d.batchStatus.reschedule(jobId,Number(b.scheduledAt))}}
        if(method==='DELETE')return{status:200,body:this.d.batchStatus.cancel(jobId)};
      }
      if((m=route(req.path,/^\/brands\/([^/]+)\/publish-jobs\/([^/]+)\/retry$/))){
        const brandId=decodeURIComponent(m[1]!),jobId=decodeURIComponent(m[2]!);this.authorize(userId,brandId);const job=this.d.store.publishJobs.get(jobId);if(!job||job.brandId!==brandId)throw new Error('JOB_NOT_FOUND');if(method==='POST')return{status:200,body:this.d.batchStatus.manualRetry(jobId,userId)};
      }

      if((m=route(req.path,/^\/brands\/([^/]+)\/products$/))){
        const brandId=decodeURIComponent(m[1]!);this.authorize(userId,brandId);
        if(method==='GET')return{status:200,body:this.d.products.list(brandId)};
        if(method==='POST'){
          const b=asObject(req.body);
          const product=this.d.products.create(brandId,{
            name:String(b.name??''),slug:String(b.slug??''),currency:String(b.currency??''),
            ...(b.description!==undefined?{description:String(b.description)}:{}),
            ...(b.imageAssetId!==undefined?{imageAssetId:String(b.imageAssetId)}:{}),
            ...(b.supplierUrl!==undefined?{supplierUrl:String(b.supplierUrl)}:{}),
            ...(b.landingUrl!==undefined?{landingUrl:String(b.landingUrl)}:{}),
            ...(b.cost!==undefined?{cost:String(b.cost)}:{}),
            ...(b.sellingPrice!==undefined?{sellingPrice:String(b.sellingPrice)}:{}),
            ...(b.status!==undefined?{status:b.status}:{}),
          });
          return{status:201,body:product};
        }
      }

      if((m=route(req.path,/^\/brands\/([^/]+)\/content$/))){
        const brandId=decodeURIComponent(m[1]!);this.authorize(userId,brandId);
        if(method==='GET')return{status:200,body:[...this.d.store.contents.values()].filter(x=>x.brandId===brandId)};
        if(method==='POST'){
          const b=asObject(req.body);
          const content=this.d.content.create(brandId,{
            type:b.type,title:String(b.title??''),
            ...(b.productId!==undefined?{productId:String(b.productId)}:{}),
            ...(b.hook!==undefined?{hook:String(b.hook)}:{}),
            ...(b.body!==undefined?{body:String(b.body)}:{}),
            ...(b.cta!==undefined?{cta:String(b.cta)}:{}),
            ...(b.masterAssetId!==undefined?{masterAssetId:String(b.masterAssetId)}:{}),
          },userId);
          return{status:201,body:content};
        }
      }

      if((m=route(req.path,/^\/brands\/([^/]+)\/content\/([^/]+)\/variants$/))){
        const brandId=decodeURIComponent(m[1]!),contentId=decodeURIComponent(m[2]!);this.authorize(userId,brandId);if(method==='GET')return{status:200,body:this.d.content.listVariants(brandId,contentId)};
      }
      if((m=route(req.path,/^\/brands\/([^/]+)\/content\/([^/]+)\/variants\/([^/]+)$/))){
        const brandId=decodeURIComponent(m[1]!),contentId=decodeURIComponent(m[2]!),variantId=decodeURIComponent(m[3]!);this.authorize(userId,brandId);this.d.content.listVariants(brandId,contentId);if(method==='PATCH'){const b=asObject(req.body);return{status:200,body:this.d.content.updateVariant(brandId,variantId,{...(b.caption!==undefined?{caption:String(b.caption)}:{}),...(b.body!==undefined?{body:String(b.body)}:{}),...(Array.isArray(b.hashtags)?{hashtags:b.hashtags.map(String)}:{}),...(b.cta!==undefined?{cta:String(b.cta)}:{}),...(b.assetId!==undefined?{assetId:String(b.assetId)}:{}),...(b.status==='READY'||b.status==='DRAFT'?{status:b.status}:{})})}}
      }
      if((m=route(req.path,/^\/brands\/([^/]+)\/content\/([^/]+)\/variants\/copy$/))){
        const brandId=decodeURIComponent(m[1]!);const contentId=decodeURIComponent(m[2]!);this.authorize(userId,brandId);
        if(method==='POST')return{status:200,body:this.d.content.copyMasterToAll(brandId,contentId)};
      }

      if((m=route(req.path,/^\/brands\/([^/]+)\/publish\/validate$/))){
        const brandId=decodeURIComponent(m[1]!);this.authorize(userId,brandId);
        if(method==='POST'){
          const b=asObject(req.body);
          const result=await this.d.publishing.validateTargets({brandId,contentId:String(b.contentId??''),socialAccountIds:Array.isArray(b.socialAccountIds)?b.socialAccountIds.map(String):[]});
          return{status:200,body:result};
        }
      }

      if((m=route(req.path,/^\/brands\/([^/]+)\/publish$/))){
        const brandId=decodeURIComponent(m[1]!);this.authorize(userId,brandId);
        if(method==='POST'){
          const b=asObject(req.body);
          const result=await this.d.publishing.createBatch({brandId,contentId:String(b.contentId??''),createdBy:userId,socialAccountIds:Array.isArray(b.socialAccountIds)?b.socialAccountIds.map(String):[],...(b.scheduledAt!==undefined?{scheduledAt:Number(b.scheduledAt)}:{})});
          return{status:201,body:result};
        }
      }

      if((m=route(req.path,/^\/brands\/([^/]+)\/analytics\/overview$/))){
        const brandId=decodeURIComponent(m[1]!);this.authorize(userId,brandId);
        if(method==='GET')return{status:200,body:this.d.analytics.overview(brandId)};
      }
      if((m=route(req.path,/^\/brands\/([^/]+)\/analytics\/content$/))){const brandId=decodeURIComponent(m[1]!);this.authorize(userId,brandId);if(method==='GET')return{status:200,body:this.d.analytics.content(brandId)}}
      if((m=route(req.path,/^\/brands\/([^/]+)\/analytics\/platforms$/))){const brandId=decodeURIComponent(m[1]!);this.authorize(userId,brandId);if(method==='GET')return{status:200,body:this.d.analytics.platforms(brandId)}}

      if((m=route(req.path,/^\/publish\/batches\/([^/]+)$/))){
        if(method==='GET'){
          const batchId=decodeURIComponent(m[1]!);const batch=this.d.store.publishBatches.get(batchId);if(!batch)throw new Error('BATCH_NOT_FOUND');this.authorize(userId,batch.brandId);
          const jobs=[...this.d.store.publishJobs.values()].filter(j=>j.batchId===batchId);
          return{status:200,body:{batchId,status:this.d.batchStatus.get(batchId),jobs}};
        }
      }

      return{status:404,body:{error:'NOT_FOUND'}};
    } catch(error:unknown){return this.mapError(error)}
  }

  private async authenticate(req:LocalRequest){
    const header=req.headers?.authorization??req.headers?.Authorization;
    if(!header?.startsWith('Bearer '))throw new Error('UNAUTHORIZED');
    try {const claims=await this.d.auth.me(header.slice(7));return claims.sub}catch{throw new Error('UNAUTHORIZED')}
  }
  private authorize(userId:string,brandId:string){try{return this.d.brandAccess.assertAccess(userId,brandId)}catch{throw new Error('BRAND_NOT_FOUND')}}
  private mapError(error:unknown):LocalResponse{
    const message=error instanceof Error?error.message:'INTERNAL_ERROR';
    if(['UNAUTHORIZED','INVALID_CREDENTIALS','INVALID_REFRESH','NODE_AUTH','INVALID_REGISTRATION','STALE_SIGNATURE','REPLAY','BAD_SIGNATURE'].includes(message))return{status:401,body:{error:message}};
    if(['BRAND_NOT_FOUND','PRODUCT_NOT_FOUND','CONTENT_NOT_FOUND','ACCOUNT_NOT_FOUND','BATCH_NOT_FOUND','JOB_NOT_FOUND','LINK_NOT_FOUND'].includes(message))return{status:404,body:{error:'NOT_FOUND'}};
    if(['CONFLICT','RETRY_NOT_ALLOWED'].includes(message))return{status:409,body:{error:message}};
    if(message.startsWith('INVALID_')||message.endsWith('_INVALID')||message.includes('UNSUPPORTED')||message==='TEXT_MEDIA_INVALID')return{status:400,body:{error:message}};
    return{status:500,body:{error:'INTERNAL_ERROR'}};
  }
}
