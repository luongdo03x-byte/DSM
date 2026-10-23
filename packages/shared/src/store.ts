import type {AuditLog,AuthSession,Brand,BioPage,Campaign,ContentItem,ContentVariant,ContentMedia,VariantMedia,MediaAsset,Product,User,Workspace,WorkspaceMember,SocialAccount,SocialComment,CommentAction,PendingMetaComment,EncryptedCredential,OAuthPending,BrowserNode,BrowserProfile,BrowserRegistration,PublishBatch,PublishJob,PublishAttempt,PublishedPost,PostMetric,ChannelSnapshot,ChannelGoal,ContentPillar,Competitor,CompetitorSnapshot,TrackedLink,ClickEvent,NotificationChannel,QuotaUsage} from './domain.ts';
export class MemoryStore {
 users=new Map<string,User>(); workspaces=new Map<string,Workspace>(); notificationChannels=new Map<string,NotificationChannel>(); memberships:WorkspaceMember[]=[]; brands=new Map<string,Brand>();
 products=new Map<string,Product>(); media=new Map<string,MediaAsset>(); contents=new Map<string,ContentItem>(); variants=new Map<string,ContentVariant>(); contentMedia=new Map<string,ContentMedia>(); variantMedia=new Map<string,VariantMedia>(); campaigns=new Map<string,Campaign>();
 authSessions=new Map<string,AuthSession>(); audit:AuditLog[]=[]; socialAccounts=new Map<string,SocialAccount>(); credentials=new Map<string,EncryptedCredential>(); oauthPending=new Map<string,OAuthPending>(); browserNodes=new Map<string,BrowserNode>(); browserProfiles=new Map<string,BrowserProfile>(); browserRegistrations=new Map<string,BrowserRegistration>(); publishBatches=new Map<string,PublishBatch>(); publishJobs=new Map<string,PublishJob>(); publishAttempts:PublishAttempt[]=[]; publishedPosts=new Map<string,PublishedPost>(); postMetrics:PostMetric[]=[]; trackedLinks=new Map<string,TrackedLink>(); clickEvents:ClickEvent[]=[];
 quotaUsage=new Map<string,QuotaUsage>();
 channelSnapshots=new Map<string,ChannelSnapshot>();
 channelGoals=new Map<string,ChannelGoal>(); contentPillars=new Map<string,ContentPillar>();
 competitors=new Map<string,Competitor>(); competitorSnapshots=new Map<string,CompetitorSnapshot>();
 bioPages=new Map<string,BioPage>();
 socialComments=new Map<string,SocialComment>(); commentActions=new Map<string,CommentAction>();
 metaWebhookEvents=new Map<string,PendingMetaComment>();
}
