import type {Repositories} from '../../../../packages/shared/src/repositories.ts';
import type {AuthService} from '../modules/auth/auth.service.ts';
import type {BrandAccessService} from '../modules/identity/brand-access.service.ts';
import type {ProductsService} from '../modules/products/products.service.ts';
import type {ContentService} from '../modules/content/content.service.ts';
import type {AccountsService} from '../modules/accounts/accounts.service.ts';
import type {PublishingService} from '../modules/publishing/publishing.service.ts';
import type {BatchStatusService} from '../modules/publishing/batch-status.service.ts';
import type {AnalyticsService} from '../modules/analytics/analytics.service.ts';
import type {TrackingService} from '../modules/tracking/tracking.service.ts';
import {BioPageService} from '../modules/tracking/bio-page.service.ts';
import {GrowthService} from '../modules/growth/growth.service.ts';
import type {MediaService} from '../modules/media/media.service.ts';
import type {CampaignsService} from '../modules/campaigns/campaigns.service.ts';
import type {CampaignPerformanceService} from '../modules/campaigns/campaign-performance.service.ts';
import type {NodeAuthService} from '../modules/browser-nodes/node-auth.service.ts';
import type {BrowserNodesService} from '../modules/browser-nodes/browser-nodes.service.ts';
import type {IntegrationsService} from '../modules/integrations/integrations.service.ts';
import type {MetaDataDeletionService} from '../modules/integrations/meta-data-deletion.service.ts';
import {id} from '../../../../packages/shared/src/ids.ts';
import {ReliabilityService} from '../modules/analytics/reliability.service.ts';
import {verifySignature,parseMetaWebhook,type MetaCommentEvent} from '../integrations/meta/meta-webhook.ts';
import {EngagementService} from '../modules/engagement/engagement.service.ts';
import type {Platform,SocialComment} from '../../../../packages/shared/src/domain.ts';

export interface LocalRequest {
  method: string;
  path: string;
  query?: Record<string,string>;
  headers?: Record<string,string>;
  body?: unknown;
  rawBody?: Buffer;
}
export interface LocalResponse {
  status: number;
  body: unknown;
  headers?: Record<string,string>;
}

type Dependencies={
  repos:Repositories;
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
  integrations?:IntegrationsService;
  dataDeletion?:MetaDataDeletionService;
  metaWebhook?:{appSecret:string;verifyToken:string;enqueue:(event:MetaCommentEvent)=>Promise<void>};
  engagement?:EngagementService;
  webAppBaseUrl?:string;
  testMode?:boolean;
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
      if(req.path==='/webhooks/meta'){
        const webhook=this.d.metaWebhook;
        if(!webhook)return{status:503,body:{error:'META_WEBHOOK_NOT_CONFIGURED'}};
        if(method==='GET'){
          if(req.query?.['hub.mode']!=='subscribe'||req.query?.['hub.verify_token']!==webhook.verifyToken)return{status:403,body:{error:'INVALID_VERIFY_TOKEN'}};
          return{status:200,body:req.query?.['hub.challenge']??'',headers:{'content-type':'text/plain; charset=utf-8'}};
        }
        if(method==='POST'){
          if(!req.rawBody||!verifySignature(req.rawBody,req.headers?.['x-hub-signature-256'],webhook.appSecret))return{status:401,body:{error:'INVALID_SIGNATURE'}};
          let payload:unknown;try{payload=JSON.parse(req.rawBody.toString('utf8'))}catch{return{status:400,body:{error:'INVALID_JSON'}}}
          for(const event of parseMetaWebhook(payload))await webhook.enqueue(event);
          return{status:200,body:{received:true}};
        }
      }
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
        const user=await this.d.repos.users.get(userId);if(!user)throw new Error('UNAUTHORIZED');
        return{status:200,body:{id:user.id,email:user.email}};
      }
      if(method==='GET'&&req.path==='/auth/context'){
        const userId=await this.authenticate(req);const memberships=await this.d.repos.memberships.findBy({userId});const workspaceIds=new Set(memberships.map(x=>x.workspaceId));const workspaces=(await this.d.repos.workspaces.findBy({})).filter(x=>workspaceIds.has(x.id));const brands=(await this.d.repos.brands.findBy({})).filter(x=>workspaceIds.has(x.workspaceId));return{status:200,body:{workspaces,brands,memberships}};
      }
      let publicMatch:RegExpExecArray|null;
      if(method==='GET'&&(publicMatch=route(req.path,/^\/r\/([^/]+)$/))){
        const referrer=req.headers?.referer,userAgent=req.headers?.['user-agent'];const target=await this.d.tracking.resolve(decodeURIComponent(publicMatch[1]!),{...(referrer?{referrer}:{}),...(userAgent?{userAgent}:{})});
        return{status:302,body:null,headers:{location:target}};
      }
      if(method==='GET'&&(publicMatch=route(req.path,/^\/b\/([^/]+)$/))){
        return{status:200,body:await new BioPageService(this.d.repos).getPublic(decodeURIComponent(publicMatch[1]!))};
      }

      if(method==='GET'&&req.path==='/integrations/meta/callback'){
        if(!this.d.integrations)return{status:501,body:{error:'META_NOT_CONFIGURED'}};
        const result=await this.d.integrations.callback(req.query?.code??'',req.query?.state??'');
        const destination=`/app/brands/${encodeURIComponent(result.brandId)}/accounts?connect=${encodeURIComponent(result.token)}`;
        return{status:302,body:null,headers:{location:this.d.webAppBaseUrl?new URL(destination,this.d.webAppBaseUrl).toString():destination}};
      }
      if(method==='GET'&&req.path==='/integrations/tiktok/callback'){
        if(!this.d.integrations)return{status:501,body:{error:'TIKTOK_NOT_CONFIGURED'}};
        const result=await this.d.integrations.callback(req.query?.code??'',req.query?.state??'');
        const destination=`/app/brands/${encodeURIComponent(result.brandId)}/accounts?connect=${encodeURIComponent(result.token)}`;
        return{status:302,body:null,headers:{location:this.d.webAppBaseUrl?new URL(destination,this.d.webAppBaseUrl).toString():destination}};
      }
      if(method==='GET'&&req.path==='/integrations/google/callback'){
        if(!this.d.integrations)return{status:501,body:{error:'GOOGLE_NOT_CONFIGURED'}};
        const result=await this.d.integrations.callback(req.query?.code??'',req.query?.state??'');
        const destination=`/app/brands/${encodeURIComponent(result.brandId)}/accounts?connect=${encodeURIComponent(result.token)}`;
        return{status:302,body:null,headers:{location:this.d.webAppBaseUrl?new URL(destination,this.d.webAppBaseUrl).toString():destination}};
      }
      if(method==='POST'&&req.path==='/integrations/meta/data-deletion'){
        if(!this.d.dataDeletion)return{status:501,body:{error:'META_NOT_CONFIGURED'}};
        const body=asObject(req.body);return{status:200,body:await this.d.dataDeletion.handle(String(body.signed_request??''))};
      }

      let nodeMatch:RegExpExecArray|null;
      if(method==='POST'&&(nodeMatch=route(req.path,/^\/browser-nodes\/([^/]+)\/register$/))){if(!this.d.nodeAuth)return{status:501,body:{error:'NODE_AUTH_NOT_CONFIGURED'}};const b=asObject(req.body);return{status:200,body:await this.d.nodeAuth.register(decodeURIComponent(nodeMatch[1]!),String(b.registrationToken??''))}}
      if(method==='POST'&&(nodeMatch=route(req.path,/^\/browser-nodes\/([^/]+)\/heartbeat$/))){if(!this.d.nodeAuth||!this.d.browserNodes)return{status:501,body:{error:'NODE_AUTH_NOT_CONFIGURED'}};const nodeId=decodeURIComponent(nodeMatch[1]!),timestamp=req.headers?.['x-node-ts']??'',signature=req.headers?.['x-node-signature']??'',body=asObject(req.body),raw=JSON.stringify(body);await this.d.nodeAuth.verify({nodeId,timestamp,method,path:req.path,body:raw,signature});return{status:200,body:await this.d.browserNodes.heartbeat(nodeId,{status:body.status==='DEGRADED'?'DEGRADED':'ONLINE',...(body.maxConcurrency!==undefined?{maxConcurrency:Number(body.maxConcurrency)}:{})})}}

      const userId=await this.authenticate(req);
      let m:RegExpExecArray|null;

      if((m=route(req.path,/^\/brands\/([^/]+)\/comments$/))&&method==='GET'){
        const brandId=decodeURIComponent(m[1]!);await this.authorize(userId,brandId);
        const status=req.query?.status?.split(',').filter(Boolean) as SocialComment['status'][]|undefined;
        if(status?.some(value=>!['NEW','READ','REPLIED','HIDDEN','DELETED'].includes(value)))throw new Error('INVALID_COMMENT_STATUS');
        const platform=req.query?.platform as Platform|undefined;
        if(platform&&!['FACEBOOK','INSTAGRAM','THREADS','TIKTOK','YOUTUBE'].includes(platform))throw new Error('INVALID_PLATFORM');
        const limit=req.query?.limit===undefined?undefined:Number(req.query.limit);
        if(limit!==undefined&&(!Number.isInteger(limit)||limit<1||limit>100))throw new Error('INVALID_LIMIT');
        const filter={...(status?.length?{status}:{}),...(platform?{platform}:{}),...(req.query?.cursor?{cursor:req.query.cursor}:{}),...(limit!==undefined?{limit}:{})};
        return{status:200,body:await (this.d.engagement??new EngagementService(this.d.repos,{})).list(brandId,filter)};
      }
      if((m=route(req.path,/^\/brands\/([^/]+)\/comments\/([^/]+)\/(reply|private-reply|hide|unhide|read)$/))&&method==='POST'){
        const brandId=decodeURIComponent(m[1]!),commentId=decodeURIComponent(m[2]!),action=m[3];await this.authorize(userId,brandId);
        const service=this.d.engagement??new EngagementService(this.d.repos,{});
        if(action==='reply')return{status:200,body:await service.reply(brandId,commentId,String(asObject(req.body).text??''),userId)};
        if(action==='private-reply')return{status:200,body:await service.privateReply(brandId,commentId,String(asObject(req.body).text??''),userId)};
        if(action==='hide'||action==='unhide')return{status:200,body:await service.hide(brandId,commentId,action==='hide',userId)};
        return{status:200,body:await service.read(brandId,commentId)};
      }

      if(this.d.testMode&&(m=route(req.path,/^\/__test\/brands\/([^/]+)\/growth-seed$/))&&method==='POST'){
        const brandId=decodeURIComponent(m[1]!);await this.authorize(userId,brandId);
        const account=(await this.d.repos.socialAccounts.findBy({brandId}))[0];if(!account)throw new Error('ACCOUNT_NOT_FOUND');
        await this.d.repos.socialAccounts.update(account.id,{status:'CONNECTED'});
        const now=Date.now(),zone=(await this.d.repos.brands.get(brandId))?.timezone??'UTC';
        const today=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
        const date=(offset:number)=>new Date(Date.parse(today+'T00:00:00Z')+offset*86_400_000).toISOString().slice(0,10);
        await this.d.repos.channelGoals.insert({id:`test-growth-goal-${account.id}`,socialAccountId:account.id,postsPer28Days:8});
        for(let offset=-28;offset<=0;offset++){const day=date(offset),existing=(await this.d.repos.channelSnapshots.findBy({socialAccountId:account.id,day}))[0],row={id:`test-growth-${account.id}-${day}`,socialAccountId:account.id,day,followers:100+offset,views:100,reach:80,engagements:8,profileViews:5,watchTimeMinutes:null,source:'TEST:fixture',capturedAt:now+offset*86_400_000,raw:{}};if(existing)await this.d.repos.channelSnapshots.update(existing.id,row);else await this.d.repos.channelSnapshots.insert(row)}
        return{status:200,body:{seeded:true,accountId:account.id}};
      }

      if((m=route(req.path,/^\/brands\/([^/]+)\/growth\/accounts\/([^/]+)$/))){
        const brandId=decodeURIComponent(m[1]!),accountId=decodeURIComponent(m[2]!);await this.authorize(userId,brandId);
        if(method==='GET'){const days=Number(req.query?.days??28);return{status:200,body:await new GrowthService(this.d.repos).account(brandId,accountId,Date.now(),days)}}
      }
      if((m=route(req.path,/^\/brands\/([^/]+)\/growth$/))){
        const brandId=decodeURIComponent(m[1]!);await this.authorize(userId,brandId);
        if(method==='GET'){const days=Number(req.query?.days??28),year=req.query?.year===undefined?undefined:Number(req.query.year);return{status:200,body:await new GrowthService(this.d.repos).overview(brandId,days,year)}}
      }

      if((method==='GET'||method==='POST')&&req.path==='/integrations/meta/start'){
        if(!this.d.integrations)return{status:501,body:{error:'META_NOT_CONFIGURED'}};
        const brandId=method==='GET'?req.query?.brandId??'':String(asObject(req.body).brandId??'');await this.authorize(userId,brandId);
        const result=await this.d.integrations.start('META',brandId,userId);
        return method==='GET'?{status:302,body:null,headers:{location:result.url}}:{status:200,body:result};
      }
      if((method==='GET'||method==='POST')&&req.path==='/integrations/tiktok/start'){
        if(!this.d.integrations)return{status:501,body:{error:'TIKTOK_NOT_CONFIGURED'}};
        const brandId=method==='GET'?req.query?.brandId??'':String(asObject(req.body).brandId??'');await this.authorize(userId,brandId);
        const result=await this.d.integrations.start('TIKTOK',brandId,userId);
        return method==='GET'?{status:302,body:null,headers:{location:result.url}}:{status:200,body:result};
      }
      if((method==='GET'||method==='POST')&&req.path==='/integrations/google/start'){
        if(!this.d.integrations)return{status:501,body:{error:'GOOGLE_NOT_CONFIGURED'}};
        const brandId=method==='GET'?req.query?.brandId??'':String(asObject(req.body).brandId??'');await this.authorize(userId,brandId);
        const result=await this.d.integrations.start('GOOGLE',brandId,userId);
        return method==='GET'?{status:302,body:null,headers:{location:result.url}}:{status:200,body:result};
      }
      if((m=route(req.path,/^\/brands\/([^/]+)\/integrations\/(pending|confirm)$/))){
        if(!this.d.integrations)return{status:501,body:{error:'META_NOT_CONFIGURED'}};
        const brandId=decodeURIComponent(m[1]!);await this.authorize(userId,brandId);
        const action=m[2];const body=action==='confirm'?asObject(req.body):undefined;
        const token=action==='pending'?req.query?.token??'':String(body?.token??'');
        const owner=await this.d.integrations.pendingOwner(token);
        if(owner.brandId!==brandId||owner.userId!==userId)throw new Error('OAUTH_PENDING_INVALID');
        if(method==='GET'&&action==='pending')return{status:200,body:await this.d.integrations.pending(token)};
        if(method==='POST'&&action==='confirm')return{status:200,body:await this.d.integrations.confirm(token,Array.isArray(body?.platformAccountIds)?body.platformAccountIds.map(String):[])};
      }

      if(method==='POST'&&req.path==='/browser-nodes/registration'){
        if(!this.d.nodeAuth)return{status:501,body:{error:'NODE_AUTH_NOT_CONFIGURED'}};const b=asObject(req.body),memberships=await this.d.repos.memberships.findBy({userId}),workspaceId=String(b.workspaceId??memberships[0]?.workspaceId??'');if(!workspaceId||!memberships.some(x=>x.workspaceId===workspaceId))throw new Error('BRAND_NOT_FOUND');return{status:201,body:await this.d.nodeAuth.createRegistration(workspaceId,String(b.name??'Browser Node'),String(b.host??'127.0.0.1'),Number(b.port??4010))}
      }

      if((m=route(req.path,/^\/brands\/([^/]+)$/))){
        const brandId=decodeURIComponent(m[1]!);await this.authorize(userId,brandId);
        if(method==='GET')return{status:200,body:await this.d.repos.brands.get(brandId)};
      }

      if((m=route(req.path,/^\/brands\/([^/]+)\/accounts$/))){
        const brandId=decodeURIComponent(m[1]!);await this.authorize(userId,brandId);
        if(method==='GET')return{status:200,body:await this.d.accounts.list(brandId)};
        if(method==='POST'){const b=asObject(req.body);return{status:201,body:await this.d.accounts.create(brandId,{platform:b.platform,username:b.username,publishMode:b.publishMode})}}
      }
      if((m=route(req.path,/^\/brands\/([^/]+)\/accounts\/([^/]+)\/tiktok\/creator-info$/))){
        const brandId=decodeURIComponent(m[1]!),accountId=decodeURIComponent(m[2]!);await this.authorize(userId,brandId);
        const account=await this.d.repos.socialAccounts.get(accountId);
        if(!account||account.brandId!==brandId||account.platform!=='TIKTOK')throw new Error('ACCOUNT_NOT_FOUND');
        if(method==='GET')return{status:200,body:await this.d.publishing.tiktokCreatorInfo(accountId)};
      }
      if((m=route(req.path,/^\/brands\/([^/]+)\/accounts\/([^/]+)\/youtube\/playlists$/))){const brandId=decodeURIComponent(m[1]!),accountId=decodeURIComponent(m[2]!);await this.authorize(userId,brandId);const account=await this.d.repos.socialAccounts.get(accountId);if(!account||account.brandId!==brandId||account.platform!=='YOUTUBE')throw new Error('ACCOUNT_NOT_FOUND');if(method==='GET')return{status:200,body:await this.d.publishing.youtubePlaylists(accountId)}}
      if(method==='GET'&&req.path==='/youtube/categories'){const regionCode=String(req.query?.regionCode??'VN').toUpperCase();if(!/^[A-Z]{2}$/.test(regionCode))throw new Error('INVALID_REGION_CODE');const memberships=await this.d.repos.memberships.findBy({userId});let accountId:string|undefined;for(const member of memberships){const brands=await this.d.repos.brands.findBy({workspaceId:member.workspaceId});for(const brand of brands){accountId=(await this.d.repos.socialAccounts.findBy({brandId:brand.id,platform:'YOUTUBE'}))[0]?.id;if(accountId)break}if(accountId)break}if(!accountId)return{status:200,body:{categories:[],audited:false}};return{status:200,body:await this.d.publishing.youtubeCategories(regionCode,accountId)}}
      if((m=route(req.path,/^\/brands\/([^/]+)\/notification-channels$/))){
        const brandId=decodeURIComponent(m[1]!),access=await this.authorize(userId,brandId);
        if(method==='GET')return{status:200,body:(await this.d.repos.notificationChannels.findBy({workspaceId:access.workspaceId})).map(({encryptedSecret:_secret,...row})=>row)};
        if(method==='POST'){
          if(!['OWNER','ADMIN'].includes(access.role))throw new Error('FORBIDDEN');
          const b=asObject(req.body),kind=String(b.kind??''),target=String(b.target??'').trim();
          if(!['TELEGRAM','EMAIL'].includes(kind)||!target||kind==='EMAIL'&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target))throw new Error('INVALID_NOTIFICATION_CHANNEL');
          const {encryptedSecret:_secret,...row}=await this.d.repos.notificationChannels.insert({id:id('notifier'),workspaceId:access.workspaceId,kind:kind as 'TELEGRAM'|'EMAIL',target,enabled:true});
          return{status:201,body:row};
        }
      }
      if((m=route(req.path,/^\/brands\/([^/]+)\/notification-channels\/([^/]+)$/))){
        const brandId=decodeURIComponent(m[1]!),channelId=decodeURIComponent(m[2]!),access=await this.authorize(userId,brandId);
        const channel=await this.d.repos.notificationChannels.get(channelId);if(!channel||channel.workspaceId!==access.workspaceId)throw new Error('NOTIFICATION_CHANNEL_NOT_FOUND');
        if(method==='PATCH'){if(!['OWNER','ADMIN'].includes(access.role))throw new Error('FORBIDDEN');const b=asObject(req.body);const {encryptedSecret:_secret,...row}=await this.d.repos.notificationChannels.update(channelId,{enabled:Boolean(b.enabled)});return{status:200,body:row}}
        if(method==='DELETE'){if(!['OWNER','ADMIN'].includes(access.role))throw new Error('FORBIDDEN');await this.d.repos.notificationChannels.remove(channelId);return{status:204,body:null}}
      }
      if((m=route(req.path,/^\/brands\/([^/]+)\/accounts\/([^/]+)\/credentials$/))){
        const brandId=decodeURIComponent(m[1]!),accountId=decodeURIComponent(m[2]!);await this.authorize(userId,brandId);const account=await this.d.repos.socialAccounts.get(accountId);if(!account||account.brandId!==brandId)throw new Error('ACCOUNT_NOT_FOUND');if(method==='POST'){const b=asObject(req.body);const updated=await this.d.accounts.saveCredential(accountId,String(b.provider??account.platform.toLowerCase()),String(b.accessToken??''),b.refreshToken!==undefined?String(b.refreshToken):undefined);return{status:200,body:{id:updated.id,status:updated.status}}}
      }
      if((m=route(req.path,/^\/brands\/([^/]+)\/accounts\/([^/]+)\/browser-profile$/))){
        const brandId=decodeURIComponent(m[1]!),accountId=decodeURIComponent(m[2]!);await this.authorize(userId,brandId);if(method==='POST'){const b=asObject(req.body);return{status:200,body:await this.d.accounts.attachBrowserProfile(brandId,accountId,String(b.browserNodeId??''),String(b.providerProfileId??''),String(b.name??'Browser profile'))}}
      }
      if((m=route(req.path,/^\/brands\/([^/]+)\/accounts\/([^/]+)\/disconnect$/))){
        const brandId=decodeURIComponent(m[1]!),accountId=decodeURIComponent(m[2]!);await this.authorize(userId,brandId);
        if(method==='POST')return{status:200,body:await this.d.accounts.disconnect(brandId,accountId,userId)};
      }
      if((m=route(req.path,/^\/brands\/([^/]+)\/browser-nodes$/))){
        const brandId=decodeURIComponent(m[1]!);const access=await this.authorize(userId,brandId);if(method==='GET')return{status:200,body:await this.d.repos.browserNodes.findBy({workspaceId:access.workspaceId})};
      }

      if((m=route(req.path,/^\/brands\/([^/]+)\/media\/uploads$/))){
        const brandId=decodeURIComponent(m[1]!);const access=await this.authorize(userId,brandId);
        if(method==='POST'){if(!this.d.media)return{status:501,body:{error:'MEDIA_NOT_CONFIGURED'}};const b=asObject(req.body);return{status:201,body:await this.d.media.createUpload({workspaceId:access.workspaceId,brandId},{type:b.type,mimeType:String(b.mimeType??''),...(b.category!==undefined?{category:String(b.category)}:{})})}}
      }

      if((m=route(req.path,/^\/brands\/([^/]+)\/products\/([^/]+)\/archive$/))){
        const brandId=decodeURIComponent(m[1]!),productId=decodeURIComponent(m[2]!);await this.authorize(userId,brandId);
        if(method==='POST')return{status:200,body:await this.d.products.archive(brandId,productId,userId)};
      }

      if((m=route(req.path,/^\/brands\/([^/]+)\/campaigns$/))){
        const brandId=decodeURIComponent(m[1]!);await this.authorize(userId,brandId);
        if(method==='GET')return{status:200,body:await this.d.repos.campaigns.findBy({brandId})};
        if(method==='POST'){if(!this.d.campaigns)return{status:501,body:{error:'CAMPAIGNS_NOT_CONFIGURED'}};const b=asObject(req.body);return{status:201,body:await this.d.campaigns.create(brandId,{name:String(b.name??''),...(b.productId!==undefined?{productId:String(b.productId)}:{}),...(b.description!==undefined?{description:String(b.description)}:{})})}}
      }
      if((m=route(req.path,/^\/brands\/([^/]+)\/campaigns\/([^/]+)\/content$/))){
        const brandId=decodeURIComponent(m[1]!),campaignId=decodeURIComponent(m[2]!);await this.authorize(userId,brandId);
        if(method==='POST'){if(!this.d.campaigns)return{status:501,body:{error:'CAMPAIGNS_NOT_CONFIGURED'}};const b=asObject(req.body);return{status:200,body:await this.d.campaigns.attachContent(brandId,campaignId,String(b.contentId??''))}}
      }
      if((m=route(req.path,/^\/brands\/([^/]+)\/campaigns\/([^/]+)\/performance$/))){
        const brandId=decodeURIComponent(m[1]!),campaignId=decodeURIComponent(m[2]!);await this.authorize(userId,brandId);
        if(method==='GET'){if(!this.d.campaignPerformance)return{status:501,body:{error:'CAMPAIGN_PERFORMANCE_NOT_CONFIGURED'}};return{status:200,body:await this.d.campaignPerformance.get(brandId,campaignId)}}
      }

      if((m=route(req.path,/^\/brands\/([^/]+)\/tracked-links$/))){
        const brandId=decodeURIComponent(m[1]!);await this.authorize(userId,brandId);
        if(method==='POST'){const b=asObject(req.body);return{status:201,body:await this.d.tracking.create(brandId,{targetUrl:String(b.targetUrl??''),...(b.productId!==undefined?{productId:String(b.productId)}:{}),...(b.contentItemId!==undefined?{contentItemId:String(b.contentItemId)}:{}),...(b.utmSource!==undefined?{utmSource:String(b.utmSource)}:{}),...(b.utmMedium!==undefined?{utmMedium:String(b.utmMedium)}:{}),...(b.utmCampaign!==undefined?{utmCampaign:String(b.utmCampaign)}:{}),...(b.utmContent!==undefined?{utmContent:String(b.utmContent)}:{})})}}
      }
      if((m=route(req.path,/^\/brands\/([^/]+)\/tracked-links\/([^/]+)\/bind$/))){
        const brandId=decodeURIComponent(m[1]!),linkId=decodeURIComponent(m[2]!);await this.authorize(userId,brandId);
        if(method==='POST'){const b=asObject(req.body);await this.d.tracking.bindToPublishedPost(brandId,linkId,String(b.publishedPostId??''));return{status:200,body:{id:linkId,publishedPostId:String(b.publishedPostId)}}}
      }
      if((m=route(req.path,/^\/brands\/([^/]+)\/bio-page$/))){
        const brandId=decodeURIComponent(m[1]!);await this.authorize(userId,brandId);const bio=new BioPageService(this.d.repos);
        if(method==='GET')return{status:200,body:(await this.d.repos.bioPages.findBy({brandId}))[0]??null};
        if(method==='PUT'||method==='POST'){const b=asObject(req.body);return{status:200,body:await bio.save(brandId,{slug:String(b.slug??''),title:String(b.title??''),links:Array.isArray(b.links)?b.links:[]})}}
      }

      if((m=route(req.path,/^\/brands\/([^/]+)\/calendar$/))){
        const brandId=decodeURIComponent(m[1]!);await this.authorize(userId,brandId);if(method==='GET'){
          if(req.query?.from!==undefined||req.query?.to!==undefined)return{status:200,body:await this.d.publishing.listCalendar(brandId,Number(req.query.from),Number(req.query.to))};
          return{status:200,body:(await this.d.repos.publishJobs.findBy({brandId})).sort((a,b)=>a.scheduledAt-b.scheduledAt)};
        }
      }
      if((m=route(req.path,/^\/brands\/([^/]+)\/calendar\/([^/]+)$/))){
        const brandId=decodeURIComponent(m[1]!),jobId=decodeURIComponent(m[2]!);await this.authorize(userId,brandId);const job=await this.d.repos.publishJobs.get(jobId);if(!job||job.brandId!==brandId)throw new Error('JOB_NOT_FOUND');
        if(method==='PATCH'){const b=asObject(req.body);return{status:200,body:await this.d.publishing.reschedule(brandId,jobId,Number(b.scheduledAt),Date.now())}}
        if(method==='DELETE')return{status:200,body:await this.d.batchStatus.cancel(jobId)};
      }
      if((m=route(req.path,/^\/brands\/([^/]+)\/publish-jobs\/([^/]+)\/retry$/))){
        const brandId=decodeURIComponent(m[1]!),jobId=decodeURIComponent(m[2]!);await this.authorize(userId,brandId);const job=await this.d.repos.publishJobs.get(jobId);if(!job||job.brandId!==brandId)throw new Error('JOB_NOT_FOUND');if(method==='POST')return{status:200,body:await this.d.batchStatus.manualRetry(jobId,userId)};
      }

      if((m=route(req.path,/^\/brands\/([^/]+)\/products$/))){
        const brandId=decodeURIComponent(m[1]!);await this.authorize(userId,brandId);
        if(method==='GET')return{status:200,body:await this.d.products.list(brandId)};
        if(method==='POST'){
          const b=asObject(req.body);
          const product=await this.d.products.create(brandId,{
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
        const brandId=decodeURIComponent(m[1]!);await this.authorize(userId,brandId);
        if(method==='GET')return{status:200,body:await this.d.repos.contents.findBy({brandId})};
        if(method==='POST'){
          const b=asObject(req.body);
          const content=await this.d.content.create(brandId,{
            type:b.type,title:String(b.title??''),
            ...(b.productId!==undefined?{productId:String(b.productId)}:{}),
            ...(b.hook!==undefined?{hook:String(b.hook)}:{}),
            ...(b.body!==undefined?{body:String(b.body)}:{}),
            ...(b.cta!==undefined?{cta:String(b.cta)}:{}),
            ...(b.masterAssetId!==undefined?{masterAssetId:String(b.masterAssetId)}:{}),
            ...(Array.isArray(b.mediaAssetIds)?{mediaAssetIds:b.mediaAssetIds.map(String)}:{}),
          },userId);
          return{status:201,body:content};
        }
      }

      if((m=route(req.path,/^\/brands\/([^/]+)\/content\/([^/]+)$/))){
        const brandId=decodeURIComponent(m[1]!),contentId=decodeURIComponent(m[2]!);await this.authorize(userId,brandId);
        if(method==='GET')return{status:200,body:await this.d.content.getDraft(brandId,contentId)};
        if(method==='PATCH'){
          const b=asObject(req.body);
          return{status:200,body:await this.d.content.update(brandId,contentId,{...(b.title!==undefined?{title:String(b.title)}:{}),...(b.hook!==undefined?{hook:String(b.hook)}:{}),...(b.body!==undefined?{body:String(b.body)}:{}),...(b.cta!==undefined?{cta:String(b.cta)}:{})})};
        }
      }

      if((m=route(req.path,/^\/brands\/([^/]+)\/content\/([^/]+)\/media$/))){
        const brandId=decodeURIComponent(m[1]!),contentId=decodeURIComponent(m[2]!);await this.authorize(userId,brandId);
        if(method==='PUT'){const b=asObject(req.body);if(!Array.isArray(b.mediaAssetIds))throw new Error('MEDIA_IDS_REQUIRED');return{status:200,body:await this.d.content.setMedia(brandId,contentId,b.mediaAssetIds.map(String))}}
      }
      if((m=route(req.path,/^\/brands\/([^/]+)\/content\/([^/]+)\/variants\/([^/]+)\/media$/))){
        const brandId=decodeURIComponent(m[1]!),contentId=decodeURIComponent(m[2]!),variantId=decodeURIComponent(m[3]!);await this.authorize(userId,brandId);await this.d.content.listVariants(brandId,contentId);
        if(method==='PUT'){const b=asObject(req.body);if(!Array.isArray(b.items))throw new Error('MEDIA_ITEMS_REQUIRED');const items=b.items.map(value=>{const item=asObject(value);return{mediaAssetId:String(item.mediaAssetId??''),...(item.crop!==undefined?{crop:item.crop as {x:number;y:number;width:number;height:number}}:{}),...(item.isCover!==undefined?{isCover:Boolean(item.isCover)}:{})}});return{status:200,body:await this.d.content.setVariantMedia(brandId,variantId,items)}}
      }
      if((m=route(req.path,/^\/brands\/([^/]+)\/content\/([^/]+)\/variants\/([^/]+)\/preflight$/))){
        const brandId=decodeURIComponent(m[1]!),contentId=decodeURIComponent(m[2]!),variantId=decodeURIComponent(m[3]!);await this.authorize(userId,brandId);const variants=await this.d.content.listVariants(brandId,contentId);if(!variants.some(variant=>variant.id===variantId))throw new Error('VARIANT_NOT_FOUND');if(method==='GET')return{status:200,body:{issues:await this.d.content.preflightVariant(brandId,variantId)}}
      }

      if((m=route(req.path,/^\/brands\/([^/]+)\/content\/([^/]+)\/variants$/))){
        const brandId=decodeURIComponent(m[1]!),contentId=decodeURIComponent(m[2]!);await this.authorize(userId,brandId);if(method==='GET')return{status:200,body:await this.d.content.listVariants(brandId,contentId)};
      }
      if((m=route(req.path,/^\/brands\/([^/]+)\/content\/([^/]+)\/variants\/([^/]+)$/))){
        const brandId=decodeURIComponent(m[1]!),contentId=decodeURIComponent(m[2]!),variantId=decodeURIComponent(m[3]!);await this.authorize(userId,brandId);await this.d.content.listVariants(brandId,contentId);if(method==='PATCH'){const b=asObject(req.body);return{status:200,body:await this.d.content.updateVariant(brandId,variantId,{...(b.caption!==undefined?{caption:String(b.caption)}:{}),...(b.body!==undefined?{body:String(b.body)}:{}),...(Array.isArray(b.hashtags)?{hashtags:b.hashtags.map(String)}:{}),...(b.cta!==undefined?{cta:String(b.cta)}:{}),...(b.assetId!==undefined?{assetId:String(b.assetId)}:{}),...(b.status==='READY'||b.status==='DRAFT'?{status:b.status}:{}),...(b.tiktokSettings?{tiktokSettings:b.tiktokSettings}:{}),...(b.youtube?{youtube:b.youtube}:{})})}}
      }
      if((m=route(req.path,/^\/brands\/([^/]+)\/content\/([^/]+)\/variants\/copy$/))){
        const brandId=decodeURIComponent(m[1]!);const contentId=decodeURIComponent(m[2]!);await this.authorize(userId,brandId);
        if(method==='POST')return{status:200,body:await this.d.content.copyMasterToAll(brandId,contentId)};
      }

      if((m=route(req.path,/^\/brands\/([^/]+)\/publish\/validate$/))){
        const brandId=decodeURIComponent(m[1]!);await this.authorize(userId,brandId);
        if(method==='POST'){
          const b=asObject(req.body);
          const result=await this.d.publishing.validateTargets({brandId,contentId:String(b.contentId??''),socialAccountIds:Array.isArray(b.socialAccountIds)?b.socialAccountIds.map(String):[]});
          return{status:200,body:result};
        }
      }

      if((m=route(req.path,/^\/brands\/([^/]+)\/publish$/))){
        const brandId=decodeURIComponent(m[1]!);await this.authorize(userId,brandId);
        if(method==='POST'){
          const b=asObject(req.body);
          const result=await this.d.publishing.createBatch({brandId,contentId:String(b.contentId??''),createdBy:userId,socialAccountIds:Array.isArray(b.socialAccountIds)?b.socialAccountIds.map(String):[],...(b.scheduledAt!==undefined?{scheduledAt:Number(b.scheduledAt)}:{})});
          return{status:201,body:result};
        }
      }

      if((m=route(req.path,/^\/brands\/([^/]+)\/analytics\/overview$/))){
        const brandId=decodeURIComponent(m[1]!);await this.authorize(userId,brandId);
        if(method==='GET')return{status:200,body:await this.d.analytics.overview(brandId)};
      }
      if((m=route(req.path,/^\/brands\/([^/]+)\/analytics\/reliability$/))){
        const brandId=decodeURIComponent(m[1]!);await this.authorize(userId,brandId);
        if(method==='GET'){const days=Number(req.query?.days??28);if(!Number.isInteger(days)||days<1||days>365)throw new Error('INVALID_DATE_RANGE');return{status:200,body:await new ReliabilityService(this.d.repos).summary(brandId,Date.now()-days*86_400_000)}}
      }
      if((m=route(req.path,/^\/brands\/([^/]+)\/analytics\/content$/))){const brandId=decodeURIComponent(m[1]!);await this.authorize(userId,brandId);if(method==='GET')return{status:200,body:await this.d.analytics.content(brandId)}}
      if((m=route(req.path,/^\/brands\/([^/]+)\/analytics\/platforms$/))){const brandId=decodeURIComponent(m[1]!);await this.authorize(userId,brandId);if(method==='GET')return{status:200,body:await this.d.analytics.platforms(brandId)}}

      if((m=route(req.path,/^\/publish\/batches\/([^/]+)$/))){
        if(method==='GET'){
          const batchId=decodeURIComponent(m[1]!);const batch=await this.d.repos.publishBatches.get(batchId);if(!batch)throw new Error('BATCH_NOT_FOUND');await this.authorize(userId,batch.brandId);
          const jobs=await this.d.repos.publishJobs.findBy({batchId});
          return{status:200,body:{batchId,status:await this.d.batchStatus.get(batchId),jobs}};
        }
      }

      return{status:404,body:{error:'NOT_FOUND'}};
    } catch(error:unknown){return this.mapError(error)}
  }

  private async authenticate(req:LocalRequest){
    const header=req.headers?.authorization??req.headers?.Authorization;
    if(!header?.startsWith('Bearer '))throw new Error('UNAUTHORIZED');
    try {const claims=await this.d.auth.me(header.slice(7));return claims.sub}catch(error){if(this.storeUnavailable(error))throw error;throw new Error('UNAUTHORIZED')}
  }
  private async authorize(userId:string,brandId:string){try{return await this.d.brandAccess.assertAccess(userId,brandId)}catch(error){if(this.storeUnavailable(error))throw error;throw new Error('BRAND_NOT_FOUND')}}
  private storeUnavailable(error:unknown){const code=(error as {code?:unknown})?.code;return ['ECONNREFUSED','ECONNRESET','P1001','P1017'].includes(String(code))}
  private mapError(error:unknown):LocalResponse{
    if(this.storeUnavailable(error))return{status:503,body:{error:'STORE_UNAVAILABLE'}};
    const message=error instanceof Error?error.message:'INTERNAL_ERROR';
    if(['UNAUTHORIZED','INVALID_CREDENTIALS','INVALID_REFRESH','NODE_AUTH','INVALID_REGISTRATION','STALE_SIGNATURE','REPLAY','BAD_SIGNATURE'].includes(message))return{status:401,body:{error:message}};
    if(message==='FORBIDDEN')return{status:403,body:{error:message}};
    if(['OAUTH_PENDING_CONSUMED','OAUTH_STATE_REPLAY'].includes(message))return{status:409,body:{error:message}};
    if(['BRAND_NOT_FOUND','PRODUCT_NOT_FOUND','CONTENT_NOT_FOUND','ACCOUNT_NOT_FOUND','COMMENT_NOT_FOUND','BATCH_NOT_FOUND','JOB_NOT_FOUND','LINK_NOT_FOUND','BIO_PAGE_NOT_FOUND','BIO_LINK_NOT_FOUND','BINDING_NOT_FOUND','NOTIFICATION_CHANNEL_NOT_FOUND'].includes(message))return{status:404,body:{error:'NOT_FOUND'}};
    if(['CONFLICT','BIO_SLUG_TAKEN','RETRY_NOT_ALLOWED','IDEMPOTENCY_CONFLICT','JOB_NOT_RESCHEDULABLE','NOT_SUPPORTED','COMMENT_GONE','ACCOUNT_NOT_CONNECTED','PRIVATE_REPLY_ALREADY_SENT','PRIVATE_REPLY_WINDOW_CLOSED'].includes(message))return{status:409,body:{error:message}};
    if(['SCHEDULE_TOO_SOON','SCHEDULE_TOO_FAR'].includes(message))return{status:400,body:{error:message}};
    if(message.startsWith('INVALID_')||message.endsWith('_INVALID')||message.includes('UNSUPPORTED')||message==='TEXT_MEDIA_INVALID')return{status:400,body:{error:message}};
    return{status:500,body:{error:'INTERNAL_ERROR'}};
  }
}
