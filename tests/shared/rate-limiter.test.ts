import test from 'node:test';
import assert from 'node:assert/strict';
import {SlidingWindowLimiter} from '../../packages/shared/src/rate-limiter.ts';
import {TikTokHttpClient} from '../../apps/api/src/integrations/tiktok/tiktok-http.client.ts';
import type {HttpClient} from '../../packages/shared/src/http.ts';

test('rate limiter xếp hàng request thứ bảy tới sau 60 giây',async()=>{
  let now=0;const waits:Array<{ms:number;release:()=>void}>=[];
  const limiter=new SlidingWindowLimiter({limit:6,windowMs:60_000,now:()=>now,sleep:ms=>new Promise<void>(resolve=>waits.push({ms,release:resolve}))});
  await Promise.all(Array.from({length:6},()=>limiter.acquire('account-a')));
  let acquired=false;const seventh=limiter.acquire('account-a').then(()=>{acquired=true});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(acquired,false);assert.deepEqual(waits.map(wait=>wait.ms),[60_000]);
  now=60_000;waits[0]!.release();await seventh;assert.equal(acquired,true);
});

test('rate limiter keeps separate account keys independent',async()=>{
  let now=0;const waits:Array<()=>void>=[];
  const limiter=new SlidingWindowLimiter({limit:1,windowMs:60_000,now:()=>now,sleep:()=>new Promise<void>(resolve=>waits.push(resolve))});
  await limiter.acquire('account-a');const blocked=limiter.acquire('account-a');
  await limiter.acquire('account-b');assert.equal(waits.length,1);
  now=60_000;waits[0]!();await blocked;
});

test('TikTok HTTP client queues a seventh API request before transport',async()=>{
  let now=0,count=0;const waits:Array<()=>void>=[];
  const limiter=new SlidingWindowLimiter({limit:6,windowMs:60_000,now:()=>now,sleep:()=>new Promise<void>(resolve=>waits.push(resolve))});
  const transport:HttpClient={async request<T>(){count++;return{status:200,data:{} as T}}};
  const config={apiBaseUrl:'https://tiktok.test',authBaseUrl:'https://tiktok.test/auth',clientKey:'key',clientSecret:'secret',redirectUri:'https://dsm.test/callback',directPostApproved:false,verifiedMediaPrefixes:[]};
  const client=new TikTokHttpClient(transport,config,limiter);
  await Promise.all(Array.from({length:6},()=>client.api('/v2/test/','user-token')));
  const seventh=client.api('/v2/test/','user-token');await new Promise(resolve=>setImmediate(resolve));
  assert.equal(count,6);assert.equal(waits.length,1);
  now=60_000;waits[0]!();await seventh;assert.equal(count,7);
});
