import type {Repositories} from '../../../../packages/shared/src/repositories.ts';
import {CredentialCryptoService} from '../../../api/src/modules/accounts/credential-crypto.service.ts';

type Tokens={access_token:string;refresh_token:string};
export class ZaloTokenVault{
  private readonly repos:Repositories;
  private readonly crypto:CredentialCryptoService;
  constructor(repos:Repositories,crypto:CredentialCryptoService){this.repos=repos;this.crypto=crypto}
  async load():Promise<Tokens|undefined>{
    const channel=(await this.repos.notificationChannels.findBy({kind:'ZALO'})).find(row=>row.encryptedSecret);
    if(!channel?.encryptedSecret)return undefined;
    const decoded=JSON.parse(await this.crypto.decrypt(JSON.parse(channel.encryptedSecret),'zalo-channel:'+channel.id)) as Tokens;
    if(!decoded.access_token||!decoded.refresh_token)throw new Error('INVALID_ZALO_TOKEN_VAULT');
    return decoded;
  }
  async save(tokens:Tokens):Promise<void>{
    const channels=await this.repos.notificationChannels.findBy({kind:'ZALO'});
    if(!channels.length)throw new Error('ZALO_CHANNEL_REQUIRED');
    await this.repos.transaction(async tx=>{for(const channel of channels){const secret=await this.crypto.encrypt(JSON.stringify(tokens),'zalo-channel:'+channel.id);await tx.notificationChannels.update(channel.id,{encryptedSecret:JSON.stringify(secret)})}});
  }
}
