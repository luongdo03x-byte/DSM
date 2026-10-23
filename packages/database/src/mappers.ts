import type {
  AuditLog, AuthSession, Brand, BrowserNode, BrowserProfile, BrowserRegistration,
  Campaign, ClickEvent, ContentItem, ContentVariant, ContentMedia, VariantMedia, EncryptedCredential, OAuthPending,
  MediaAsset, PostMetric, Product, PublishAttempt, PublishBatch, PublishedPost,
  PublishJob, SocialAccount, TrackedLink, User, Workspace, WorkspaceMember,
} from '../../shared/src/domain.ts';

type RecordValue = Record<string, any>;
export type DomainTable = keyof typeof fields;

const fields = {
  users: ['id', 'email', 'passwordHash', 'status'],
  workspaces: ['id', 'name'],
  notificationChannels: ['id', 'workspaceId', 'kind', 'target', 'encryptedSecret', 'enabled'],
  memberships: ['workspaceId', 'userId', 'role'],
  brands: ['id', 'workspaceId', 'name', 'slug', 'language', 'timezone', 'currency', 'status'],
  products: ['id', 'brandId', 'name', 'slug', 'description', 'imageAssetId', 'supplierUrl', 'landingUrl', 'cost', 'sellingPrice', 'currency', 'status'],
  media: ['id', 'brandId', 'workspaceId', 'type', 'storageKey', 'mimeType', 'sizeBytes', 'width', 'height', 'durationMs', 'derivedFromAssetId', 'variantKey', 'exifStripped', 'codec'],
  contents: ['id', 'brandId', 'productId', 'pillarId', 'type', 'title', 'hook', 'body', 'cta', 'masterAssetId', 'status'],
  contentMedia: ['id', 'contentItemId', 'mediaAssetId', 'position'],
  variantMedia: ['id', 'contentVariantId', 'mediaAssetId', 'position', 'crop', 'isCover'],
  variants: ['id', 'contentItemId', 'socialAccountId', 'platform', 'caption', 'body', 'hashtags', 'cta', 'assetId', 'status', 'format', 'title', 'skippedReason', 'tiktokSettings', 'youtube'],
  campaigns: ['id', 'brandId', 'productId', 'name', 'description', 'status', 'startAt', 'endAt', 'contentIds'],
  authSessions: ['id', 'userId', 'refreshTokenHash', 'expiresAt', 'revokedAt'],
  audit: ['id', 'workspaceId', 'userId', 'action', 'entityType', 'entityId', 'metadata', 'createdAt'],
  socialAccounts: ['id', 'brandId', 'platform', 'username', 'displayName', 'platformAccountId', 'publishMode', 'status', 'browserProfileId', 'commentsPolledAt'],
  socialComments: ['id', 'brandId', 'socialAccountId', 'platform', 'platformCommentId', 'platformPostId', 'publishedPostId', 'parentCommentId', 'authorId', 'authorName', 'isFromPage', 'text', 'createdAt', 'status', 'privateReplySentAt'],
  commentActions: ['id', 'commentId', 'kind', 'text', 'ruleId', 'userId', 'status', 'errorCode', 'createdAt'],
  replyTemplates: ['id', 'brandId', 'name', 'text'],
  automationRules: ['id', 'brandId', 'name', 'enabled', 'platforms', 'match', 'actions', 'maxPerHour'],
  credentials: ['id', 'socialAccountId', 'provider', 'ciphertext', 'iv', 'authTag', 'refreshCiphertext', 'expiresAt', 'scopes', 'providerUserId'],
  oauthPending: ['id', 'brandId', 'userId', 'tokenHash', 'ciphertext', 'iv', 'authTag', 'expiresAt', 'consumedAt'],
  browserNodes: ['id', 'workspaceId', 'name', 'host', 'port', 'status', 'provider', 'lastSeenAt', 'maxConcurrency', 'encryptedNodeKey'],
  browserProfiles: ['id', 'brandId', 'browserNodeId', 'socialAccountId', 'provider', 'providerProfileId', 'name', 'status', 'metadata'],
  browserRegistrations: ['id', 'nodeId', 'tokenHash', 'expiresAt', 'consumedAt'],
  publishBatches: ['id', 'brandId', 'contentItemId', 'createdBy', 'createdAt'],
  publishJobs: ['id', 'batchId', 'brandId', 'socialAccountId', 'contentVariantId', 'platform', 'strategy', 'scheduledAt', 'publishAt', 'status', 'attemptCount', 'maxAttempts', 'idempotencyKey', 'processingStartedAt', 'remoteCorrelationId', 'errorCode', 'errorMessage'],
  publishAttempts: ['id', 'publishJobId', 'attemptNumber', 'strategy', 'startedAt', 'finishedAt', 'status', 'errorType', 'errorCode', 'errorMessage', 'metadata'],
  publishedPosts: ['id', 'brandId', 'publishJobId', 'socialAccountId', 'contentVariantId', 'platform', 'platformPostId', 'platformPostUrl', 'publishedAt'],
  postMetrics: ['id', 'publishedPostId', 'capturedAt', 'captureKey', 'views', 'likes', 'comments', 'shares', 'saves', 'clicks', 'rawMetrics'],
  channelSnapshots: ['id','socialAccountId','day','followers','views','reach','engagements','profileViews','watchTimeMinutes','source','capturedAt','raw'],
  channelGoals: ['id','socialAccountId','postsPer28Days','followersTarget','targetDate'],
  contentPillars: ['id','brandId','name','color','description'],
  competitors: ['id','brandId','platform','handle','source'],
  competitorSnapshots: ['id','competitorId','day','followers','posts','source','capturedAt','raw'],
  trackedLinks: ['id', 'brandId', 'productId', 'contentItemId', 'publishedPostId', 'code', 'targetUrl', 'utmSource', 'utmMedium', 'utmCampaign', 'utmContent'],
  bioPages: ['id','brandId','slug','title','links'],
  clickEvents: ['id', 'trackedLinkId', 'timestamp', 'referrer', 'userAgent', 'country', 'deviceType'],
} as const;

const epochFields = new Set(['expiresAt', 'revokedAt', 'createdAt', 'privateReplySentAt', 'commentsPolledAt', 'lastSeenAt', 'scheduledAt', 'publishAt', 'processingStartedAt', 'startedAt', 'finishedAt', 'publishedAt', 'capturedAt', 'timestamp', 'consumedAt', 'sizeBytes', 'views', 'likes', 'comments', 'shares', 'saves', 'clicks','followers','reach','engagements','profileViews','watchTimeMinutes','posts']);

export function toDomain(table: DomainTable, row: RecordValue): RecordValue {
  const result: RecordValue = {};
  for (const key of fields[table]) {
    let value = row[key];
    if (table === 'campaigns' && key === 'contentIds') value = row.contents?.map((link: RecordValue) => link.contentItemId) ?? [];
    if (table === 'socialAccounts' && key === 'browserProfileId') value = row.browserProfile?.id;
    if (value === null || value === undefined) {if((table==='channelSnapshots'||table==='competitorSnapshots')&&value===null)result[key]=null;continue}
    if (typeof value === 'bigint') value = Number(value);
    if ((key === 'cost' || key === 'sellingPrice') && typeof value === 'object') value = value.toString();
    if (value instanceof Date) value = value.toISOString();
    result[key] = value;
  }
  return result;
}

export function toRow(table: DomainTable, entity: RecordValue): RecordValue {
  const result: RecordValue = {};
  for (const key of fields[table]) {
    if (key === 'contentIds' || key === 'browserProfileId') continue;
    const value = entity[key];
    if (value === undefined) continue;
    if (epochFields.has(key) && typeof value === 'number') result[key] = BigInt(value);
    else if ((key === 'startAt' || key === 'endAt') && typeof value === 'string') result[key] = new Date(value);
    else result[key] = value;
  }
  if (table === 'media') result.storageProvider = 'S3';
  if (table === 'publishBatches') result.status = 'QUEUED';
  if (table === 'campaigns' && Array.isArray(entity.contentIds)) {
    result.contents = {deleteMany: {}, create: entity.contentIds.map((contentItemId: string) => ({contentItemId}))};
  }
  return result;
}

export function toCreateRow(table: DomainTable, entity: RecordValue): RecordValue {
  const result = toRow(table, entity);
  if (table === 'campaigns' && result.contents) delete result.contents.deleteMany;
  return result;
}

export function toWhere(table: DomainTable, where: RecordValue): RecordValue {
  const result = toRow(table, where);
  if (table === 'media') delete result.storageProvider;
  if (table === 'publishBatches') delete result.status;
  if (table === 'campaigns') delete result.contents;
  return result;
}

export const toDomainUser = (row: RecordValue): User => toDomain('users', row) as User;
export const toRowUser = (row: User) => toRow('users', row);
export const toDomainWorkspace = (row: RecordValue): Workspace => toDomain('workspaces', row) as Workspace;
export const toRowWorkspace = (row: Workspace) => toRow('workspaces', row);
export const toDomainWorkspaceMember = (row: RecordValue): WorkspaceMember => toDomain('memberships', row) as WorkspaceMember;
export const toRowWorkspaceMember = (row: WorkspaceMember) => toRow('memberships', row);
export const toDomainBrand = (row: RecordValue): Brand => toDomain('brands', row) as Brand;
export const toRowBrand = (row: Brand) => toRow('brands', row);
export const toDomainProduct = (row: RecordValue): Product => toDomain('products', row) as Product;
export const toRowProduct = (row: Product) => toRow('products', row);
export const toDomainMediaAsset = (row: RecordValue): MediaAsset => toDomain('media', row) as MediaAsset;
export const toRowMediaAsset = (row: MediaAsset) => toRow('media', row);
export const toDomainContentItem = (row: RecordValue): ContentItem => toDomain('contents', row) as ContentItem;
export const toRowContentItem = (row: ContentItem) => toRow('contents', row);
export const toDomainContentVariant = (row: RecordValue): ContentVariant => toDomain('variants', row) as ContentVariant;
export const toRowContentVariant = (row: ContentVariant) => toRow('variants', row);
export const toDomainContentMedia = (row: RecordValue): ContentMedia => toDomain('contentMedia', row) as ContentMedia;
export const toRowContentMedia = (row: ContentMedia) => toRow('contentMedia', row);
export const toDomainVariantMedia = (row: RecordValue): VariantMedia => toDomain('variantMedia', row) as VariantMedia;
export const toRowVariantMedia = (row: VariantMedia) => toRow('variantMedia', row);
export const toDomainCampaign = (row: RecordValue): Campaign => toDomain('campaigns', row) as Campaign;
export const toRowCampaign = (row: Campaign) => toRow('campaigns', row);
export const toDomainAuthSession = (row: RecordValue): AuthSession => toDomain('authSessions', row) as AuthSession;
export const toRowAuthSession = (row: AuthSession) => toRow('authSessions', row);
export const toDomainAuditLog = (row: RecordValue): AuditLog => toDomain('audit', row) as AuditLog;
export const toRowAuditLog = (row: AuditLog) => toRow('audit', row);
export const toDomainSocialAccount = (row: RecordValue): SocialAccount => toDomain('socialAccounts', row) as SocialAccount;
export const toRowSocialAccount = (row: SocialAccount) => toRow('socialAccounts', row);
export const toDomainEncryptedCredential = (row: RecordValue): EncryptedCredential => toDomain('credentials', row) as EncryptedCredential;
export const toRowEncryptedCredential = (row: EncryptedCredential) => toRow('credentials', row);
export const toDomainOAuthPending = (row: RecordValue): OAuthPending => toDomain('oauthPending', row) as OAuthPending;
export const toDomainBrowserNode = (row: RecordValue): BrowserNode => toDomain('browserNodes', row) as BrowserNode;
export const toRowBrowserNode = (row: BrowserNode) => toRow('browserNodes', row);
export const toDomainBrowserProfile = (row: RecordValue): BrowserProfile => toDomain('browserProfiles', row) as BrowserProfile;
export const toRowBrowserProfile = (row: BrowserProfile) => toRow('browserProfiles', row);
export const toDomainBrowserRegistration = (row: RecordValue): BrowserRegistration & {id: string} => toDomain('browserRegistrations', row) as BrowserRegistration & {id: string};
export const toRowBrowserRegistration = (row: BrowserRegistration & {id: string}) => toRow('browserRegistrations', row);
export const toDomainPublishBatch = (row: RecordValue): PublishBatch => toDomain('publishBatches', row) as PublishBatch;
export const toRowPublishBatch = (row: PublishBatch) => toRow('publishBatches', row);
export const toDomainPublishJob = (row: RecordValue): PublishJob => toDomain('publishJobs', row) as PublishJob;
export const toRowPublishJob = (row: PublishJob) => toRow('publishJobs', row);
export const toDomainPublishAttempt = (row: RecordValue): PublishAttempt => toDomain('publishAttempts', row) as PublishAttempt;
export const toRowPublishAttempt = (row: PublishAttempt) => toRow('publishAttempts', row);
export const toDomainPublishedPost = (row: RecordValue): PublishedPost => toDomain('publishedPosts', row) as PublishedPost;
export const toRowPublishedPost = (row: PublishedPost) => toRow('publishedPosts', row);
export const toDomainPostMetric = (row: RecordValue): PostMetric => toDomain('postMetrics', row) as PostMetric;
export const toRowPostMetric = (row: PostMetric) => toRow('postMetrics', row);
export const toDomainTrackedLink = (row: RecordValue): TrackedLink => toDomain('trackedLinks', row) as TrackedLink;
export const toRowTrackedLink = (row: TrackedLink) => toRow('trackedLinks', row);
export const toDomainClickEvent = (row: RecordValue): ClickEvent => toDomain('clickEvents', row) as ClickEvent;
export const toRowClickEvent = (row: ClickEvent) => toRow('clickEvents', row);
