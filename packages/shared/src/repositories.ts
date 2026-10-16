import type {
  AuditLog, AuthSession, Brand, BrowserNode, BrowserProfile, BrowserRegistration,
  Campaign, ClickEvent, ContentItem, ContentVariant, EncryptedCredential, JobStatus,
  MediaAsset, PostMetric, Product, PublishAttempt, PublishBatch, PublishedPost,
  PublishJob, SocialAccount, TrackedLink, User, Workspace, WorkspaceMember,
} from './domain.ts';

export interface Repo<T extends {id: string}> {
  get(id: string): Promise<T | undefined>;
  findBy(where: Partial<T>): Promise<T[]>;
  insert(row: T): Promise<T>;
  update(id: string, patch: Partial<T>): Promise<T>;
  remove(id: string): Promise<void>;
}

export interface AppendRepo<T> {
  append(row: T): Promise<void>;
  findBy(where: Partial<T>): Promise<T[]>;
}

export interface PublishJobRepo extends Repo<PublishJob> {
  findDue(now: number, limit: number): Promise<PublishJob[]>;
  claim(id: string, from: JobStatus[], to: JobStatus): Promise<boolean>;
  findInRange(brandId: string, from: number, to: number): Promise<PublishJob[]>;
}

export interface Repositories {
  users: Repo<User>;
  workspaces: Repo<Workspace>;
  brands: Repo<Brand>;
  memberships: AppendRepo<WorkspaceMember>;
  products: Repo<Product>;
  media: Repo<MediaAsset>;
  contents: Repo<ContentItem>;
  variants: Repo<ContentVariant>;
  campaigns: Repo<Campaign>;
  authSessions: Repo<AuthSession>;
  audit: AppendRepo<AuditLog>;
  socialAccounts: Repo<SocialAccount>;
  credentials: Repo<EncryptedCredential>;
  browserNodes: Repo<BrowserNode>;
  browserProfiles: Repo<BrowserProfile>;
  browserRegistrations: Repo<BrowserRegistration & {id: string}>;
  publishBatches: Repo<PublishBatch>;
  publishJobs: PublishJobRepo;
  publishAttempts: AppendRepo<PublishAttempt>;
  publishedPosts: Repo<PublishedPost>;
  postMetrics: AppendRepo<PostMetric>;
  trackedLinks: Repo<TrackedLink>;
  clickEvents: AppendRepo<ClickEvent>;
  transaction<R>(fn: (tx: Repositories) => Promise<R>): Promise<R>;
}
