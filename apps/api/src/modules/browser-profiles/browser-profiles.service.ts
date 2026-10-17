import type {Repositories} from '../../../../../packages/shared/src/repositories.ts';
import {id} from '../../../../../packages/shared/src/ids.ts';
import type {BrowserProvider} from '../../../../../packages/browser-contracts/src/index.ts';
import {BrowserNodesService} from '../browser-nodes/browser-nodes.service.ts';

export class BrowserProfilesService {
  private readonly repos: Repositories;
  private readonly nodes: BrowserNodesService;
  private readonly provider: BrowserProvider;
  constructor(repos: Repositories, nodes: BrowserNodesService, provider: BrowserProvider) {
    this.repos = repos; this.nodes = nodes; this.provider = provider;
  }

  async create(brandId: string, nodeId: string, name: string, socialAccountId?: string) {
    await this.nodes.getDispatchableNode(nodeId);
    if (socialAccountId) {
      const account = await this.repos.socialAccounts.get(socialAccountId);
      if (!account || account.brandId !== brandId) throw new Error('ACCOUNT_NOT_FOUND');
    }
    const external = await this.provider.createProfile({name});
    const profile = await this.repos.browserProfiles.insert({id: id('bp'), brandId, browserNodeId: nodeId, provider: 'GPMLOGIN',
      providerProfileId: external.id, name, status: 'READY', ...(socialAccountId ? {socialAccountId} : {})});
    if (socialAccountId) await this.repos.socialAccounts.update(socialAccountId, {browserProfileId: profile.id});
    return profile;
  }

  async start(brandId: string, idv: string) {
    const profile = await this.get(brandId, idv);
    await this.nodes.getDispatchableNode(profile.browserNodeId);
    const session = await this.provider.startProfile(profile.providerProfileId);
    await this.repos.browserProfiles.update(idv, {status: 'RUNNING'});
    return session;
  }

  async stop(brandId: string, idv: string): Promise<void> {
    const profile = await this.get(brandId, idv);
    await this.provider.stopProfile(profile.providerProfileId);
    await this.repos.browserProfiles.update(idv, {status: 'STOPPED'});
  }

  async get(brandId: string, idv: string) {
    const profile = await this.repos.browserProfiles.get(idv);
    if (!profile || profile.brandId !== brandId) throw new Error('PROFILE_NOT_FOUND');
    return profile;
  }
}
