import type {Platform, PublishMode, SocialAccount} from '../../../../../packages/shared/src/domain.ts';
import type {Repositories} from '../../../../../packages/shared/src/repositories.ts';
import {id} from '../../../../../packages/shared/src/ids.ts';
import {CredentialCryptoService} from './credential-crypto.service.ts';
import type {AuditService} from '../audit/audit.service.ts';

export class AccountsService {
  private readonly repos: Repositories;
  private readonly cryptoSvc: CredentialCryptoService;
  private readonly audit: AuditService | undefined;
  constructor(repos: Repositories, cryptoSvc: CredentialCryptoService, audit?: AuditService) {
    this.repos = repos; this.cryptoSvc = cryptoSvc; this.audit = audit;
  }

  async create(brandId: string, input: {platform: Platform; username?: string; publishMode?: PublishMode}): Promise<SocialAccount> {
    return this.repos.socialAccounts.insert({id: id('acc'), brandId, platform: input.platform, publishMode: input.publishMode ?? 'HYBRID',
      status: 'DISCONNECTED', ...(input.username ? {username: input.username} : {})});
  }

  async list(brandId: string): Promise<SocialAccount[]> {return this.repos.socialAccounts.findBy({brandId})}

  async saveCredential(accountId: string, provider: string, accessToken: string, refreshToken?: string): Promise<SocialAccount> {
    const account = await this.repos.socialAccounts.get(accountId);
    if (!account) throw new Error('ACCOUNT_NOT_FOUND');
    const aad = 'social-account:' + accountId + ':' + provider;
    const encrypted = await this.cryptoSvc.encrypt(accessToken, aad);
    const refresh = refreshToken ? await this.cryptoSvc.encrypt(refreshToken, aad) : undefined;
    const row = {provider, ciphertext: encrypted.ciphertext, iv: encrypted.iv, authTag: encrypted.authTag,
      ...(refresh ? {refreshCiphertext: JSON.stringify(refresh)} : {})};
    return this.repos.transaction(async tx => {
      const old = (await tx.credentials.findBy({socialAccountId: accountId}))[0];
      if (old) await tx.credentials.update(old.id, row);
      else await tx.credentials.insert({id: id('cred'), socialAccountId: accountId, ...row});
      return tx.socialAccounts.update(accountId, {status: 'CONNECTED'});
    });
  }

  async getAccessToken(accountId: string): Promise<string> {
    const credential = (await this.repos.credentials.findBy({socialAccountId: accountId}))[0];
    if (!credential) throw new Error('AUTH_ERROR');
    return this.cryptoSvc.decrypt(credential, 'social-account:' + accountId + ':' + credential.provider);
  }

  async attachBrowserProfile(brandId: string, accountId: string, nodeId: string, providerProfileId: string, name: string) {
    const account = await this.repos.socialAccounts.get(accountId);
    if (!account || account.brandId !== brandId) throw new Error('ACCOUNT_NOT_FOUND');
    const brand = await this.repos.brands.get(brandId), node = await this.repos.browserNodes.get(nodeId);
    if (!brand || !node || node.workspaceId !== brand.workspaceId) throw new Error('NODE_NOT_FOUND');
    const profile = await this.repos.browserProfiles.insert({id: id('bp'), brandId, browserNodeId: nodeId, provider: 'GPMLOGIN',
      providerProfileId, name, status: 'READY', socialAccountId: accountId});
    await this.repos.socialAccounts.update(accountId, {browserProfileId: profile.id});
    return profile;
  }

  async disconnect(brandId: string, accountId: string, userId?: string): Promise<SocialAccount> {
    const account = await this.repos.socialAccounts.get(accountId);
    if (!account || account.brandId !== brandId) throw new Error('ACCOUNT_NOT_FOUND');
    const workspaceId = this.audit ? await this.audit.workspaceForBrand(brandId) : undefined;
    return this.repos.transaction(async tx => {
      const changed = await tx.socialAccounts.update(accountId, {status: 'DISCONNECTED'});
      const credential = (await tx.credentials.findBy({socialAccountId: accountId}))[0];
      if (credential) await tx.credentials.remove(credential.id);
      if (this.audit && workspaceId) await this.audit.record({workspaceId, ...(userId ? {userId} : {}), action: 'ACCOUNT_DISCONNECT', entityType: 'SOCIAL_ACCOUNT', entityId: accountId}, tx);
      return changed;
    });
  }
}
