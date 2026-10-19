import type {BrowserRegistration, PublishJob} from './domain.ts';
import type {AppendRepo, PublishJobRepo, Repo, Repositories} from './repositories.ts';
import {MemoryStore} from './store.ts';

function matches<T>(row: T, where: Partial<T>): boolean {
  return Object.entries(where).every(([key, value]) => Object.is((row as Record<string, unknown>)[key], value));
}

class MapRepo<T extends {id: string}> implements Repo<T> {
  private readonly rows: Map<string, T>;
  constructor(rows: Map<string, T>) {this.rows = rows}

  async get(id: string): Promise<T | undefined> {
    const row = this.rows.get(id);
    return row === undefined ? undefined : structuredClone(row);
  }

  async findBy(where: Partial<T>): Promise<T[]> {
    return [...this.rows.values()].filter(row => matches(row, where)).map(row => structuredClone(row));
  }

  async insert(row: T): Promise<T> {
    if (this.rows.has(row.id)) throw new Error('DUPLICATE_ID');
    this.rows.set(row.id, structuredClone(row));
    return structuredClone(row);
  }

  async update(id: string, patch: Partial<T>): Promise<T> {
    const current = this.rows.get(id);
    if (!current) throw new Error('NOT_FOUND');
    const next = structuredClone({...current, ...patch, id});
    this.rows.set(id, next);
    return structuredClone(next);
  }

  async remove(id: string): Promise<void> {
    this.rows.delete(id);
  }
}

class ArrayRepo<T> implements AppendRepo<T> {
  private readonly rows: T[];
  constructor(rows: T[]) {this.rows = rows}

  async append(row: T): Promise<void> {
    this.rows.push(structuredClone(row));
  }

  async findBy(where: Partial<T>): Promise<T[]> {
    return this.rows.filter(row => matches(row, where)).map(row => structuredClone(row));
  }
}

class OrderedMapRepo<T extends {id: string; position: number}> extends MapRepo<T> {
  async findBy(where: Partial<T>): Promise<T[]> {
    return (await super.findBy(where)).sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
  }
}

class MemoryPublishJobRepo extends MapRepo<PublishJob> implements PublishJobRepo {
  private readonly jobs: Map<string, PublishJob>;
  constructor(jobs: Map<string, PublishJob>) {super(jobs); this.jobs = jobs}

  async findDue(now: number, limit: number): Promise<PublishJob[]> {
    return [...this.jobs.values()]
      .filter(job => (job.status === 'QUEUED' || job.status === 'RETRYING') && job.scheduledAt <= now)
      .sort((a, b) => a.scheduledAt - b.scheduledAt || a.id.localeCompare(b.id))
      .slice(0, Math.max(0, limit))
      .map(job => structuredClone(job));
  }

  async claim(id: string, from: PublishJob['status'][], to: PublishJob['status'], options: {patch?: Partial<PublishJob>; dueAt?: number} = {}): Promise<boolean> {
    const job = this.jobs.get(id);
    if (!job || !from.includes(job.status) || (options.dueAt !== undefined && job.scheduledAt > options.dueAt)) return false;
    const changed: PublishJob = {...job, ...options.patch, status: to};
    if (to === 'PROCESSING' && !from.includes('PROCESSING')) changed.processingStartedAt = Date.now();
    else if (to !== 'PROCESSING') delete changed.processingStartedAt;
    this.jobs.set(id, changed);
    return true;
  }

  async findInRange(brandId: string, from: number, to: number): Promise<PublishJob[]> {
    return [...this.jobs.values()]
      .filter(job => job.brandId === brandId && job.scheduledAt >= from && job.scheduledAt <= to)
      .sort((a, b) => a.scheduledAt - b.scheduledAt || a.id.localeCompare(b.id))
      .map(job => structuredClone(job));
  }
}

export class MemoryRepositories implements Repositories {
  private readonly store: MemoryStore;
  readonly users: Repositories['users'];
  readonly workspaces: Repositories['workspaces'];
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
  readonly trackedLinks: Repositories['trackedLinks'];
  readonly clickEvents: Repositories['clickEvents'];

  constructor(store: MemoryStore) {
    this.store = store;
    this.users = new MapRepo(store.users);
    this.workspaces = new MapRepo(store.workspaces);
    this.brands = new MapRepo(store.brands);
    this.memberships = new ArrayRepo(store.memberships);
    this.products = new MapRepo(store.products);
    this.media = new MapRepo(store.media);
    this.contentMedia = new OrderedMapRepo(store.contentMedia);
    this.variantMedia = new OrderedMapRepo(store.variantMedia);
    this.contents = new MapRepo(store.contents);
    this.variants = new MapRepo(store.variants);
    this.campaigns = new MapRepo(store.campaigns);
    this.authSessions = new MapRepo(store.authSessions);
    this.audit = new ArrayRepo(store.audit);
    this.socialAccounts = new MapRepo(store.socialAccounts);
    this.credentials = new MapRepo(store.credentials);
    this.oauthPending = new MapRepo(store.oauthPending);
    this.browserNodes = new MapRepo(store.browserNodes);
    this.browserProfiles = new MapRepo(store.browserProfiles);
    this.browserRegistrations = new MapRepo(store.browserRegistrations as Map<string, BrowserRegistration & {id: string}>);
    this.publishBatches = new MapRepo(store.publishBatches);
    this.publishJobs = new MemoryPublishJobRepo(store.publishJobs);
    this.publishAttempts = new ArrayRepo(store.publishAttempts);
    this.publishedPosts = new MapRepo(store.publishedPosts);
    this.postMetrics = new ArrayRepo(store.postMetrics);
    this.trackedLinks = new MapRepo(store.trackedLinks);
    this.clickEvents = new ArrayRepo(store.clickEvents);
  }

  async transaction<R>(fn: (tx: Repositories) => Promise<R>): Promise<R> {
    const before = structuredClone(this.store);
    try {
      return await fn(this);
    } catch (error) {
      for (const key of Object.keys(before) as (keyof MemoryStore)[]) {
        const current = this.store[key] as Map<unknown, unknown> | unknown[];
        const snapshot = before[key] as Map<unknown, unknown> | unknown[];
        if (current instanceof Map && snapshot instanceof Map) {
          current.clear();
          for (const [id, row] of snapshot) current.set(id, row);
        } else if (Array.isArray(current) && Array.isArray(snapshot)) {
          current.splice(0, current.length, ...snapshot);
        }
      }
      throw error;
    }
  }
}
