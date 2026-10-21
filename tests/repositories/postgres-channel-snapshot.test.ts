import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createPrismaClient} from '../../packages/database/src/client.ts';
import {PrismaRepositories} from '../../packages/database/src/prisma-repositories.ts';

const databaseUrl=process.env.DATABASE_URL_TEST;if(!databaseUrl||!new URL(databaseUrl).pathname.endsWith('_test'))throw new Error('DATABASE_URL_TEST must point to a _test database');
test('Postgres enforces one snapshot per account and day and keeps absent metrics null',async()=>{
  const client=createPrismaClient(databaseUrl),repos=new PrismaRepositories(client),suffix=randomUUID();await client.$connect();
  try{
    await repos.workspaces.insert({id:'ws-'+suffix,name:'Snapshot test'});
    await repos.brands.insert({id:'brand-'+suffix,workspaceId:'ws-'+suffix,name:'Brand',slug:suffix,language:'vi',timezone:'UTC',currency:'VND',status:'ACTIVE'});
    await repos.socialAccounts.insert({id:'account-'+suffix,brandId:'brand-'+suffix,platform:'YOUTUBE',publishMode:'API',status:'CONNECTED'});
    const row={id:'snapshot-'+suffix,socialAccountId:'account-'+suffix,day:'2026-10-21',followers:100,views:null,reach:null,engagements:null,profileViews:null,watchTimeMinutes:null,source:'YOUTUBE:subscriberCount',capturedAt:123,raw:{followers:100}};
    const stored=await repos.channelSnapshots.insert(row);assert.equal(stored.views,null);
    await assert.rejects(repos.channelSnapshots.insert({...row,id:'second-'+suffix}),/DUPLICATE_ID/);
    const updated=await repos.channelSnapshots.update(row.id,{followers:101});assert.equal(updated.followers,101);
  }finally{await repos.socialAccounts.remove('account-'+suffix);await repos.brands.remove('brand-'+suffix);await repos.workspaces.remove('ws-'+suffix);await client.$disconnect()}
});
