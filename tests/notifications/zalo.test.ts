import test from 'node:test';
import assert from 'node:assert/strict';
import {ZaloNotifier} from '../../apps/worker/src/notifications/zalo.notifier.ts';
import type {NotificationChannel} from '../../packages/shared/src/domain.ts';
import {ZaloTokenVault} from '../../apps/worker/src/notifications/zalo-token-vault.ts';
import {CredentialCryptoService} from '../../apps/api/src/modules/accounts/credential-crypto.service.ts';
import {MemoryRepositories} from '../../packages/shared/src/memory-repositories.ts';
import {MemoryStore} from '../../packages/shared/src/store.ts';

const channel:NotificationChannel={id:'z',workspaceId:'w',kind:'ZALO',target:'follower-user-id',enabled:true};
const event={kind:'ACCOUNT_EXPIRED' as const,brandId:'b',socialAccountId:'a',platform:'FACEBOOK' as const};

test('Zalo gửi tin tư vấn tới user ID đã quan tâm với nội dung tiếng Việt',async()=>{
  const calls:Array<{url:string;headers:Headers;body:unknown}>=[];
  const notifier=new ZaloNotifier({accessToken:'token',appUrl:'https://dsm.test',fetcher:async(input,init)=>{calls.push({url:String(input),headers:new Headers(init?.headers),body:JSON.parse(String(init?.body))});return Response.json({error:0})}});
  await notifier.send(channel,event);
  assert.equal(calls[0]?.url,'https://openapi.zalo.me/v3.0/oa/message/cs');
  assert.equal(calls[0]?.headers.get('access_token'),'token');
  assert.deepEqual((calls[0]?.body as {recipient:unknown}).recipient,{user_id:'follower-user-id'});
  assert.match(String((calls[0]?.body as {message:{text:string}}).message.text),/kết nối Facebook đã hết hạn/);
});

test('Zalo làm mới access token khi hết hạn và dùng refresh token một lần',async()=>{
  const tokens:string[]=[],saved:string[]=[];
  const notifier=new ZaloNotifier({accessToken:'old',refreshToken:'refresh-old',appId:'app',appSecret:'secret',appUrl:'https://dsm.test',onTokenRefresh:async pair=>{saved.push(pair.refresh_token)},fetcher:async(input,init)=>{
    const url=String(input);
    if(url.includes('oauth.zaloapp.com')){assert.equal(new Headers(init?.headers).get('secret_key'),'secret');assert.match(String(init?.body),/refresh_token=refresh-old/);return Response.json({access_token:'new',refresh_token:'refresh-new'})}
    tokens.push(new Headers(init?.headers).get('access_token')??'');
    return tokens.length===1?Response.json({error:-1},{status:401}):Response.json({error:0});
  }});
  await notifier.send(channel,event);
  assert.deepEqual(tokens,['old','new']);
  assert.deepEqual(saved,['refresh-new']);
});

test('Zalo token mới được mã hóa và nạp lại sau khởi động worker',async()=>{
  const repos=new MemoryRepositories(new MemoryStore());
  await repos.notificationChannels.insert(channel);
  const crypto=new CredentialCryptoService(new Uint8Array(32).fill(7));
  await new ZaloTokenVault(repos,crypto).save({access_token:'access-new',refresh_token:'refresh-new'});
  const persisted=(await repos.notificationChannels.get('z'))?.encryptedSecret??'';
  assert.ok(persisted&&!persisted.includes('refresh-new'));
  assert.deepEqual(await new ZaloTokenVault(repos,crypto).load(),{access_token:'access-new',refresh_token:'refresh-new'});
});
