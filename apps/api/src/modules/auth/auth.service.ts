import type {MemoryStore} from '../../../../../packages/shared/src/store.ts';
import {id} from '../../../../../packages/shared/src/ids.ts';
import {randomToken,sha256,signToken,verifyToken} from '../../../../../packages/shared/src/security.ts';
import type {AuditService} from '../audit/audit.service.ts';
export interface PasswordHasher{hash(password:string):Promise<string>;verify(hash:string,password:string):Promise<boolean>}
export class Node24Argon2idHasher implements PasswordHasher{
 async hash(password:string){const m:any=await import('node:crypto');if(!m.argon2Sync)throw new Error('NODE24_ARGON2_REQUIRED');const salt=m.randomBytes(16);const out=m.argon2Sync('argon2id',{message:password,nonce:salt,parallelism:1,memory:65536,passes:3,tagLength:32});return `argon2id$${salt.toString('base64url')}$${Buffer.from(out).toString('base64url')}`}
 async verify(hash:string,password:string){const [kind,salt,digest]=hash.split('$');if(kind!=='argon2id'||!salt||!digest)return false;const m:any=await import('node:crypto');if(!m.argon2Sync)throw new Error('NODE24_ARGON2_REQUIRED');const out=m.argon2Sync('argon2id',{message:password,nonce:Buffer.from(salt,'base64url'),parallelism:1,memory:65536,passes:3,tagLength:32});return Buffer.from(out).toString('base64url')===digest}
}
export class AuthService{
 private store:MemoryStore; private hasher:PasswordHasher; private accessSecret:string; private audit:AuditService|undefined;
 constructor(store:MemoryStore,hasher:PasswordHasher,accessSecret:string,audit?:AuditService){this.store=store;this.hasher=hasher;this.accessSecret=accessSecret;this.audit=audit}
 async login(email:string,password:string){const user=[...this.store.users.values()].find(x=>x.email===email&&x.status==='ACTIVE');if(!user||!await this.hasher.verify(user.passwordHash,password))throw new Error('INVALID_CREDENTIALS');const issued=await this.issue(user.id);const membership=this.store.memberships.find(x=>x.userId===user.id);if(this.audit&&membership)await this.audit.record({workspaceId:membership.workspaceId,userId:user.id,action:'LOGIN',entityType:'USER',entityId:user.id});return issued}
 private async issue(userId:string){const raw=randomToken();const sid=id('ses');this.store.authSessions.set(sid,{id:sid,userId,refreshTokenHash:await sha256(raw),expiresAt:Date.now()+30*86400_000});return {accessToken:await signToken({sub:userId},this.accessSecret,900),refreshToken:`${sid}.${raw}`,csrfToken:randomToken(18)}}
 async refresh(sessionToken:string){const [sid,raw]=sessionToken.split('.');if(!sid||!raw)throw new Error('INVALID_REFRESH');const s=this.store.authSessions.get(sid);if(!s||s.revokedAt||s.expiresAt<Date.now()||await sha256(raw)!==s.refreshTokenHash)throw new Error('INVALID_REFRESH');s.revokedAt=Date.now();return this.issue(s.userId)}
 async logout(sessionToken:string){const sid=sessionToken.split('.')[0];if(sid){const s=this.store.authSessions.get(sid);if(s)s.revokedAt=Date.now()}}
 async me(accessToken:string){return verifyToken<{sub:string,exp:number}>(accessToken,this.accessSecret)}
}
