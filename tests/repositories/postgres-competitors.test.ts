import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createPrismaClient} from '../../packages/database/src/client.ts';
import {PrismaRepositories} from '../../packages/database/src/prisma-repositories.ts';
import {CompetitorsService} from '../../apps/api/src/modules/growth/competitors.service.ts';

const databaseUrl=process.env.DATABASE_URL_TEST;if(!databaseUrl||!new URL(databaseUrl).pathname.endsWith('_test'))throw new Error('DATABASE_URL_TEST must point to a _test database');
test('Postgres competitor snapshot upserts one row per local day and preserves null metrics',async()=>{
  const client=createPrismaClient(databaseUrl),repos=new PrismaRepositories(client),suffix=randomUUID();await client.$connect();
  try{await repos.workspaces.insert({id:'ws-'+suffix,name:'Competitor test'});await repos.brands.insert({id:'brand-'+suffix,workspaceId:'ws-'+suffix,name:'Brand',slug:suffix,language:'vi',timezone:'UTC',currency:'VND',status:'ACTIVE'});
    const service=new CompetitorsService({repos,tokens:async()=> 'token',now:()=>Date.parse('2026-10-21T12:00:00Z')});
    const competitor=await service.add('brand-'+suffix,{platform:'TIKTOK',handle:'creator'});
    await service.captureManual(competitor.id,{followers:10,posts:null});await service.captureManual(competitor.id,{followers:12,posts:null});
    const rows=await repos.competitorSnapshots.findBy({competitorId:competitor.id});assert.equal(rows.length,1);assert.equal(rows[0]?.followers,12);assert.equal(rows[0]?.posts,null);
  }finally{await repos.brands.remove('brand-'+suffix);await repos.workspaces.remove('ws-'+suffix);await client.$disconnect()}
});
