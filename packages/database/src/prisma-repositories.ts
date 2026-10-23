import type {PublishJob} from '../../shared/src/domain.ts';
import type {AppendRepo, PublishJobRepo, Repo, Repositories,QuotaUsageRepo} from '../../shared/src/repositories.ts';
import type {PrismaClient} from './client.ts';
import {toCreateRow, toDomain, toRow, toWhere, type DomainTable} from './mappers.ts';

type Delegate = {
  findUnique(args: any): Promise<any>;
  findMany(args: any): Promise<any[]>;
  create(args: any): Promise<any>;
  update(args: any): Promise<any>;
  deleteMany(args: any): Promise<any>;
  updateMany(args: any): Promise<{count: number}>;
};

function domainError(error: unknown): never {
  const code = (error as {code?: string})?.code;
  if (code === 'P2002') throw new Error('DUPLICATE_ID');
  if (code === 'P2025') throw new Error('NOT_FOUND');
  throw error;
}

class TableRepo<T extends {id: string}> implements Repo<T> {
  protected readonly delegate: Delegate;
  protected readonly table: DomainTable;
  private readonly include: Record<string, boolean> | undefined;
  private readonly orderBy: Array<Record<string, string>> | undefined;
  constructor(delegate: Delegate, table: DomainTable, include?: Record<string, boolean>, orderBy?: Array<Record<string, string>>) {
    this.delegate = delegate;
    this.table = table;
    this.include = include;
    this.orderBy = orderBy;
  }

  async get(id: string): Promise<T | undefined> {
    const row = await this.delegate.findUnique({where: {id}, ...(this.include ? {include: this.include} : {})});
    return row ? toDomain(this.table, row) as T : undefined;
  }

  async findBy(where: Partial<T>): Promise<T[]> {
    const rows = await this.delegate.findMany({where: toWhere(this.table, where), ...(this.include ? {include: this.include} : {}), ...(this.orderBy ? {orderBy: this.orderBy} : {})});
    return rows.map(row => toDomain(this.table, row) as T);
  }

  async insert(row: T): Promise<T> {
    try {
      const created = await this.delegate.create({data: toCreateRow(this.table, row), ...(this.include ? {include: this.include} : {})});
      return toDomain(this.table, created) as T;
    } catch (error) {return domainError(error)}
  }

  async update(id: string, patch: Partial<T>): Promise<T> {
    try {
      const updated = await this.delegate.update({where: {id}, data: toRow(this.table, patch), ...(this.include ? {include: this.include} : {})});
      return toDomain(this.table, updated) as T;
    } catch (error) {return domainError(error)}
  }

  async remove(id: string): Promise<void> {
    await this.delegate.deleteMany({where: {id}});
  }
}

class TableAppendRepo<T> implements AppendRepo<T> {
  private readonly delegate: Delegate;
  private readonly table: DomainTable;
  constructor(delegate: Delegate, table: DomainTable) {this.delegate = delegate; this.table = table}

  async append(row: T): Promise<void> {
    try {await this.delegate.create({data: toRow(this.table, row as Record<string, any>)})}
    catch (error) {domainError(error)}
  }

  async findBy(where: Partial<T>): Promise<T[]> {
    const rows = await this.delegate.findMany({where: toWhere(this.table, where as Record<string, any>)});
    return rows.map(row => toDomain(this.table, row) as T);
  }
}

class PrismaPublishJobRepo extends TableRepo<PublishJob> implements PublishJobRepo {
  constructor(delegate: Delegate) {super(delegate, 'publishJobs')}

  async findDue(now: number, limit: number): Promise<PublishJob[]> {
    const rows = await this.delegate.findMany({
      where: {status: {in: ['QUEUED', 'RETRYING']}, scheduledAt: {lte: BigInt(now)}},
      orderBy: [{scheduledAt: 'asc'}, {id: 'asc'}],
      take: Math.max(0, limit),
    });
    return rows.map(row => toDomain('publishJobs', row) as PublishJob);
  }

  async claim(id: string, from: PublishJob['status'][], to: PublishJob['status'], options: {patch?: Partial<PublishJob>; dueAt?: number} = {}): Promise<boolean> {
    const result = await this.delegate.updateMany({where: {id, status: {in: from}, ...(options.dueAt !== undefined ? {scheduledAt: {lte: BigInt(options.dueAt)}} : {})}, data: {...toRow('publishJobs',options.patch??{}), status: to, ...((to === 'PROCESSING' && from.includes('PROCESSING')) ? {} : {processingStartedAt: to === 'PROCESSING' ? BigInt(Date.now()) : null})}});
    return result.count === 1;
  }

  async findInRange(brandId: string, from: number, to: number): Promise<PublishJob[]> {
    const rows = await this.delegate.findMany({
      where: {brandId, OR:[{publishAt:{gte:BigInt(from),lte:BigInt(to)}},{publishAt:null,scheduledAt:{gte:BigInt(from),lte:BigInt(to)}}]},
      orderBy: [{publishAt: 'asc'}, {scheduledAt: 'asc'}, {id: 'asc'}],
    });
    return rows.map(row => toDomain('publishJobs', row) as PublishJob).sort((a,b)=>(a.publishAt??a.scheduledAt)-(b.publishAt??b.scheduledAt)||a.id.localeCompare(b.id));
  }
}

export class PrismaRepositories implements Repositories {
  private readonly client: PrismaClient;
  readonly users: Repositories['users'];
  readonly workspaces: Repositories['workspaces'];
  readonly notificationChannels: Repositories['notificationChannels'];
  readonly brands: Repositories['brands'];
  readonly memberships: Repositories['memberships'];
  readonly products: Repositories['products'];
  readonly media: Repositories['media'];
  readonly contentMedia: Repositories['contentMedia'];
  readonly variantMedia: Repositories['variantMedia'];
  readonly contents: Repositories['contents'];
  readonly variants: Repositories['variants'];
  readonly campaigns: Repositories['campaigns'];
  readonly authSessions: Repositories['authSessions'];
  readonly audit: Repositories['audit'];
  readonly socialAccounts: Repositories['socialAccounts'];
  readonly socialComments: Repositories['socialComments'];
  readonly commentActions: Repositories['commentActions'];
  readonly replyTemplates: Repositories['replyTemplates'];
  readonly automationRules: Repositories['automationRules'];
  readonly credentials: Repositories['credentials'];
  readonly oauthPending: Repositories['oauthPending'];
  readonly browserNodes: Repositories['browserNodes'];
  readonly browserProfiles: Repositories['browserProfiles'];
  readonly browserRegistrations: Repositories['browserRegistrations'];
  readonly publishBatches: Repositories['publishBatches'];
  readonly publishJobs: PublishJobRepo;
  readonly publishAttempts: Repositories['publishAttempts'];
  readonly publishedPosts: Repositories['publishedPosts'];
  readonly postMetrics: Repositories['postMetrics'];
  readonly channelSnapshots: Repositories['channelSnapshots'];
  readonly channelGoals: Repositories['channelGoals'];
  readonly contentPillars: Repositories['contentPillars'];
  readonly competitors: Repositories['competitors'];
  readonly competitorSnapshots: Repositories['competitorSnapshots'];
  readonly quotaUsage:QuotaUsageRepo;
  readonly trackedLinks: Repositories['trackedLinks'];
  readonly bioPages: Repositories['bioPages'];
  readonly clickEvents: Repositories['clickEvents'];

  constructor(client: PrismaClient) {
    this.client = client;
    const db = client as unknown as Record<string, Delegate>;
    this.users = new TableRepo(db.user!, 'users');
    this.workspaces = new TableRepo(db.workspace!, 'workspaces');
    this.notificationChannels = new TableRepo(db.notificationChannel!, 'notificationChannels');
    this.brands = new TableRepo(db.brand!, 'brands');
    this.memberships = new TableAppendRepo(db.workspaceMember!, 'memberships');
    this.products = new TableRepo(db.product!, 'products');
    this.media = new TableRepo(db.mediaAsset!, 'media');
    this.contentMedia = new TableRepo(db.contentMedia!, 'contentMedia', undefined, [{position: 'asc'}, {id: 'asc'}]);
    this.variantMedia = new TableRepo(db.variantMedia!, 'variantMedia', undefined, [{position: 'asc'}, {id: 'asc'}]);
    this.contents = new TableRepo(db.contentItem!, 'contents');
    this.variants = new TableRepo(db.contentVariant!, 'variants');
    this.campaigns = new TableRepo(db.campaign!, 'campaigns', {contents: true});
    this.authSessions = new TableRepo(db.authSession!, 'authSessions');
    this.audit = new TableAppendRepo(db.auditLog!, 'audit');
    this.socialAccounts = new TableRepo(db.socialAccount!, 'socialAccounts', {browserProfile: true});
    this.socialComments = new TableRepo(db.socialComment!, 'socialComments');
    this.commentActions = new TableRepo(db.commentAction!, 'commentActions');
    this.replyTemplates = new TableRepo(db.replyTemplate!, 'replyTemplates');
    this.automationRules = new TableRepo(db.automationRule!, 'automationRules');
    this.credentials = new TableRepo(db.encryptedCredential!, 'credentials');
    this.oauthPending = new TableRepo(db.oAuthPending!, 'oauthPending');
    this.browserNodes = new TableRepo(db.browserNode!, 'browserNodes');
    this.browserProfiles = new TableRepo(db.browserProfile!, 'browserProfiles');
    this.browserRegistrations = new TableRepo(db.browserRegistration!, 'browserRegistrations');
    this.publishBatches = new TableRepo(db.publishBatch!, 'publishBatches');
    this.publishJobs = new PrismaPublishJobRepo(db.publishJob!);
    this.publishAttempts = new TableAppendRepo(db.publishAttempt!, 'publishAttempts');
    this.publishedPosts = new TableRepo(db.publishedPost!, 'publishedPosts');
    this.postMetrics = new TableAppendRepo(db.postMetric!, 'postMetrics');
    this.channelSnapshots = new TableRepo(db.channelSnapshot!, 'channelSnapshots');
    this.channelGoals = new TableRepo(db.channelGoal!, 'channelGoals');
    this.contentPillars = new TableRepo(db.contentPillar!, 'contentPillars');
    this.competitors = new TableRepo(db.competitor!, 'competitors');
    this.competitorSnapshots = new TableRepo(db.competitorSnapshot!, 'competitorSnapshots');
    const quota=(client as any).quotaUsage;
    this.quotaUsage={get:async id=>quota.findUnique({where:{id}}),tryConsume:async(row,limit)=>{await quota.createMany({data:[{...row,used:0}],skipDuplicates:true});const result=await quota.updateMany({where:{id:row.id,used:{lt:limit}},data:{used:{increment:1}}});return result.count===1}};
    this.trackedLinks = new TableRepo(db.trackedLink!, 'trackedLinks');
    this.bioPages = new TableRepo(db.bioPage!, 'bioPages');
    this.clickEvents = new TableAppendRepo(db.clickEvent!, 'clickEvents');
  }

  async transaction<R>(fn: (tx: Repositories) => Promise<R>): Promise<R> {
    const client = this.client as any;
    if (typeof client.$transaction !== 'function') return fn(this);
    return client.$transaction(async (tx: PrismaClient) => fn(new PrismaRepositories(tx)));
  }
}
