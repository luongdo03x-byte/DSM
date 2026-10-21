import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createPrismaClient} from '../../packages/database/src/client.ts';
import {PrismaRepositories} from '../../packages/database/src/prisma-repositories.ts';

const databaseUrl=process.env.DATABASE_URL_TEST;if(!databaseUrl||!new URL(databaseUrl).pathname.endsWith('_test'))throw new Error('DATABASE_URL_TEST must point to a _test database');
test('growth goals and content pillars persist with content assignment',async()=>{
  const client=createPrismaClient(databaseUrl),repos=new PrismaRepositories(client),suffix=randomUUID();await client.$connect();
  try{
    await repos.workspaces.insert({id:'ws-'+suffix,name:'Growth test'});
    await repos.brands.insert({id:'brand-'+suffix,workspaceId:'ws-'+suffix,name:'Brand',slug:suffix,language:'vi',timezone:'UTC',currency:'VND',status:'ACTIVE'});
    await repos.socialAccounts.insert({id:'account-'+suffix,brandId:'brand-'+suffix,platform:'YOUTUBE',publishMode:'API',status:'CONNECTED'});
    await repos.channelGoals.insert({id:'goal-'+suffix,socialAccountId:'account-'+suffix,postsPer28Days:12,followersTarget:500,targetDate:'2027-01-01'});
    await repos.contentPillars.insert({id:'pillar-'+suffix,brandId:'brand-'+suffix,name:'Hướng dẫn',color:'#336699'});
    await repos.contents.insert({id:'content-'+suffix,brandId:'brand-'+suffix,pillarId:'pillar-'+suffix,type:'VIDEO',title:'Bài 1',status:'READY'});
    assert.equal((await repos.channelGoals.findBy({socialAccountId:'account-'+suffix}))[0]?.postsPer28Days,12);
    assert.equal((await repos.contents.get('content-'+suffix))?.pillarId,'pillar-'+suffix);
    await assert.rejects(repos.channelGoals.insert({id:'other-'+suffix,socialAccountId:'account-'+suffix,postsPer28Days:3}),/DUPLICATE_ID/);
  }finally{await repos.contents.remove('content-'+suffix);await repos.contentPillars.remove('pillar-'+suffix);await repos.channelGoals.remove('goal-'+suffix);await repos.socialAccounts.remove('account-'+suffix);await repos.brands.remove('brand-'+suffix);await repos.workspaces.remove('ws-'+suffix);await client.$disconnect()}
});
