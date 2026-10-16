import {id} from '../../../../../packages/shared/src/ids.ts';
import {randomToken, sha256, signToken, verifyToken} from '../../../../../packages/shared/src/security.ts';
import type {Repositories} from '../../../../../packages/shared/src/repositories.ts';
import type {AuditService} from '../audit/audit.service.ts';

export interface PasswordHasher {hash(password: string): Promise<string>; verify(hash: string, password: string): Promise<boolean>}
export class Node24Argon2idHasher implements PasswordHasher {
  async hash(password: string) {
    const crypto: any = await import('node:crypto');
    if (!crypto.argon2Sync) throw new Error('NODE24_ARGON2_REQUIRED');
    const salt = crypto.randomBytes(16);
    const output = crypto.argon2Sync('argon2id', {message: password, nonce: salt, parallelism: 1, memory: 65536, passes: 3, tagLength: 32});
    return `argon2id$${salt.toString('base64url')}$${Buffer.from(output).toString('base64url')}`;
  }
  async verify(hash: string, password: string) {
    const [kind, salt, digest] = hash.split('$');
    if (kind !== 'argon2id' || !salt || !digest) return false;
    const crypto: any = await import('node:crypto');
    if (!crypto.argon2Sync) throw new Error('NODE24_ARGON2_REQUIRED');
    const output = crypto.argon2Sync('argon2id', {message: password, nonce: Buffer.from(salt, 'base64url'), parallelism: 1, memory: 65536, passes: 3, tagLength: 32});
    return Buffer.from(output).toString('base64url') === digest;
  }
}

export class AuthService {
  private readonly repos: Repositories;
  private readonly hasher: PasswordHasher;
  private readonly accessSecret: string;
  private readonly audit: AuditService | undefined;
  constructor(repos: Repositories, hasher: PasswordHasher, accessSecret: string, audit?: AuditService) {
    this.repos = repos; this.hasher = hasher; this.accessSecret = accessSecret; this.audit = audit;
  }

  async login(email: string, password: string) {
    const users = await this.repos.users.findBy({email, status: 'ACTIVE'});
    const user = users[0];
    if (!user || !await this.hasher.verify(user.passwordHash, password)) throw new Error('INVALID_CREDENTIALS');
    const issued = await this.issue(user.id);
    const membership = (await this.repos.memberships.findBy({userId: user.id}))[0];
    if (this.audit && membership) await this.audit.record({workspaceId: membership.workspaceId, userId: user.id, action: 'LOGIN', entityType: 'USER', entityId: user.id});
    return issued;
  }

  private async issue(userId: string) {
    const raw = randomToken(), sid = id('ses');
    await this.repos.authSessions.insert({id: sid, userId, refreshTokenHash: await sha256(raw), expiresAt: Date.now() + 30 * 86400_000});
    return {accessToken: await signToken({sub: userId}, this.accessSecret, 900), refreshToken: `${sid}.${raw}`, csrfToken: randomToken(18)};
  }

  async refresh(sessionToken: string) {
    const [sid, raw] = sessionToken.split('.');
    if (!sid || !raw) throw new Error('INVALID_REFRESH');
    const session = await this.repos.authSessions.get(sid);
    if (!session || session.revokedAt || session.expiresAt < Date.now() || await sha256(raw) !== session.refreshTokenHash) throw new Error('INVALID_REFRESH');
    await this.repos.authSessions.update(sid, {revokedAt: Date.now()});
    return this.issue(session.userId);
  }

  async logout(sessionToken: string): Promise<void> {
    const sid = sessionToken.split('.')[0];
    if (!sid) return;
    const session = await this.repos.authSessions.get(sid);
    if (session) await this.repos.authSessions.update(sid, {revokedAt: Date.now()});
  }

  async me(accessToken: string) {return verifyToken<{sub: string; exp: number}>(accessToken, this.accessSecret)}
}
