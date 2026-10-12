import test from 'node:test';
import assert from 'node:assert/strict';
import {ApiClient,type Fetcher} from '../../apps/web/src/lib/api-client.ts';
import {MemorySession} from '../../apps/web/src/features/auth/session.ts';

test('concurrent unauthorized API requests perform only one rotating refresh',async()=>{
  const session=new MemorySession();
  let refreshCalls=0;
  const fetcher:Fetcher=async(path,init)=>{
    if(path==='/auth/refresh'){
      refreshCalls++;
      await new Promise(resolve=>setTimeout(resolve,10));
      return {status:200,json:async()=>({accessToken:'new-access'})};
    }
    const valid=init?.headers?.authorization==='Bearer new-access';
    return {status:valid?200:401,json:async()=>({path,valid})};
  };
  const client=new ApiClient({session,fetcher,csrfTokenResolver:()=> 'csrf-value'});
  const responses=await Promise.all(['/brands/a/accounts','/brands/a/calendar','/brands/a/analytics/overview'].map(path=>client.request<{valid:boolean}>(path)));
  assert.equal(refreshCalls,1);
  assert.deepEqual(responses.map(value=>value.valid),[true,true,true]);
  assert.equal(session.getAccessToken(),'new-access');
});

test('late 401 from old token does not rotate newly refreshed session again',async()=>{
  const session=new MemorySession();session.setAccessToken('old-access');
  let refreshCalls=0;
  const fetcher:Fetcher=async(path,init)=>{
    if(path==='/auth/refresh'){
      refreshCalls++;
      return {status:200,json:async()=>({accessToken:'new-access'})};
    }
    const token=init?.headers?.authorization;
    if(path==='/slow'&&token==='Bearer old-access')await new Promise(resolve=>setTimeout(resolve,20));
    return {status:token==='Bearer new-access'?200:401,json:async()=>({ok:true})};
  };
  const client=new ApiClient({session,fetcher});
  const [fast,slow]=await Promise.all([client.request<{ok:boolean}>('/fast'),client.request<{ok:boolean}>('/slow')]);
  assert.equal(fast.ok&&slow.ok,true);
  assert.equal(refreshCalls,1);
});
