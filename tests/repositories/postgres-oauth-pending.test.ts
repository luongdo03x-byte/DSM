import test from 'node:test';
import assert from 'node:assert/strict';
import {createPrismaClient} from '../../packages/database/src/client.ts';
import {PrismaRepositories} from '../../packages/database/src/prisma-repositories.ts';

const databaseUrl=process.env.DATABASE_URL_TEST;
if(!databaseUrl||!new URL(databaseUrl).pathname.endsWith('_test'))throw new Error('DATABASE_URL_TEST must point to a _test database');

test('postgres persists encrypted OAuth pending state and consumption time',async()=>{
  const client=createPrismaClient(databaseUrl),repos=new PrismaRepositories(client),suffix=`${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const workspaceId='w-'+suffix,brandId='b-'+suffix,pendingId='op-'+suffix;
  try{
    await repos.workspaces.insert({id:workspaceId,name:'W'});
    await repos.brands.insert({id:brandId,workspaceId,name:'B',slug:brandId,language:'en',timezone:'UTC',currency:'USD',status:'ACTIVE'});
    const expiresAt=Date.now()+900_000;
    await repos.oauthPending.insert({id:pendingId,brandId,userId:'user',tokenHash:'hash-'+suffix,ciphertext:'cipher',iv:'iv',authTag:'tag',expiresAt});
    assert.equal((await repos.oauthPending.findBy({tokenHash:'hash-'+suffix}))[0]?.expiresAt,expiresAt);
    await repos.oauthPending.update(pendingId,{consumedAt:Date.now()});
    assert.ok((await repos.oauthPending.get(pendingId))?.consumedAt);
  } finally {await repos.oauthPending.remove(pendingId);await repos.brands.remove(brandId);await repos.workspaces.remove(workspaceId);await client.$disconnect()}
});
