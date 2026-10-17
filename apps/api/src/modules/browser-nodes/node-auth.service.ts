import type {Repositories} from '../../../../../packages/shared/src/repositories.ts';
import {id} from '../../../../../packages/shared/src/ids.ts';
import {hmac, randomToken, sha256} from '../../../../../packages/shared/src/security.ts';
import {CredentialCryptoService} from '../accounts/credential-crypto.service.ts';

export class NodeAuthService {
  private readonly repos: Repositories;
  private readonly crypto: CredentialCryptoService;
  private readonly usedNonces = new Set<string>();
  constructor(repos: Repositories, crypto: CredentialCryptoService) {this.repos = repos; this.crypto = crypto}

  async createRegistration(workspaceId: string, name: string, host = '127.0.0.1', port = 4010) {
    const nodeId = id('node'), token = randomToken();
    await this.repos.transaction(async tx => {
      await tx.browserNodes.insert({id: nodeId, workspaceId, name, host, port, status: 'OFFLINE', provider: 'GPMLOGIN', maxConcurrency: 2});
      await tx.browserRegistrations.insert({id: nodeId, nodeId, tokenHash: await sha256(token), expiresAt: Date.now() + 600_000});
    });
    return {nodeId, registrationToken: token};
  }

  async register(nodeId: string, token: string) {
    const registration = await this.repos.browserRegistrations.get(nodeId);
    if (!registration || registration.consumedAt || registration.expiresAt < Date.now() || registration.tokenHash !== await sha256(token)) throw new Error('INVALID_REGISTRATION');
    const key = randomToken(32), encrypted = await this.crypto.encrypt(key, 'browser-node:' + nodeId);
    await this.repos.transaction(async tx => {
      await tx.browserRegistrations.update(nodeId, {consumedAt: Date.now()});
      await tx.browserNodes.update(nodeId, {encryptedNodeKey: JSON.stringify(encrypted)});
    });
    return {nodeKey: key};
  }

  canonical(ts: string, method: string, path: string, bodyHash: string) {
    return [ts, method.toUpperCase(), path, bodyHash].join('\n');
  }
  async sign(key: string, ts: string, method: string, path: string, body: string) {
    return hmac(key, this.canonical(ts, method, path, await sha256(body)));
  }
  async verify(input: {nodeId: string; timestamp: string; method: string; path: string; body: string; signature: string}) {
    const node = await this.repos.browserNodes.get(input.nodeId);
    if (!node?.encryptedNodeKey) throw new Error('NODE_AUTH');
    if (Math.abs(Date.now() - Number(input.timestamp)) > 60_000) throw new Error('STALE_SIGNATURE');
    const nonce = [input.nodeId, input.timestamp, input.signature].join(':');
    if (this.usedNonces.has(nonce)) throw new Error('REPLAY');
    const key = await this.crypto.decrypt(JSON.parse(node.encryptedNodeKey), 'browser-node:' + input.nodeId);
    const expected = await this.sign(key, input.timestamp, input.method, input.path, input.body);
    if (expected !== input.signature) throw new Error('BAD_SIGNATURE');
    this.usedNonces.add(nonce);
    return true;
  }
}
