import test from 'node:test';
import assert from 'node:assert/strict';
import {MemoryRepositories} from '../../packages/shared/src/memory-repositories.ts';
import {MemoryStore} from '../../packages/shared/src/store.ts';
import {QuotaManager,pacificDayKey} from '../../packages/shared/src/quota.ts';
import {createPrismaClient} from '../../packages/database/src/client.ts';
import {PrismaRepositories} from '../../packages/database/src/prisma-repositories.ts';

test('Pacific quota resets at 00:05 following local day across daylight saving',async()=>{
  for(const now of [Date.parse('2026-01-15T20:00:00Z'),Date.parse('2026-07-15T20:00:00Z')]){
    const quota=new QuotaManager(new MemoryRepositories(new MemoryStore()),()=>now);
    assert.deepEqual(await quota.tryConsume('YOUTUBE','project-1',2),{ok:true});
    assert.deepEqual(await quota.tryConsume('YOUTUBE','project-1',2),{ok:true});
    const denied=await quota.tryConsume('YOUTUBE','project-1',2);assert.equal(denied.ok,false);
    if(!denied.ok){const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Los_Angeles',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(denied.retryAt);assert.equal(parts,'00:05');assert.notEqual(pacificDayKey(denied.retryAt),pacificDayKey(now))}
  }
});

test('parallel consumers cannot exceed the project limit',async()=>{
  const quota=new QuotaManager(new MemoryRepositories(new MemoryStore()),()=>Date.parse('2026-10-21T12:00:00Z'));
  const results=await Promise.all(Array.from({length:5},()=>quota.tryConsume('YOUTUBE','same-project',3)));
  assert.equal(results.filter(x=>x.ok).length,3);assert.equal((await quota.usage('YOUTUBE','same-project',3)).used,3);
});

test('postgres quota increment is atomic across manager instances',async()=>{
  const url=process.env.DATABASE_URL_TEST;if(!url)throw new Error('DATABASE_URL_TEST required');
  const client=createPrismaClient(url);await client.$connect();
  try{const repos=new PrismaRepositories(client),scope=`project-${crypto.randomUUID()}`,now=()=>Date.parse('2026-10-21T12:00:00Z');
    const results=await Promise.all(Array.from({length:12},()=>new QuotaManager(repos,now).tryConsume('YOUTUBE',scope,3)));
    assert.equal(results.filter(x=>x.ok).length,3);assert.equal((await new QuotaManager(repos,now).usage('YOUTUBE',scope,3)).used,3);
  }finally{await client.$disconnect()}
});
