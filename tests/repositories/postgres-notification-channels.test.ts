import test from 'node:test';
import assert from 'node:assert/strict';
import {createPrismaClient} from '../../packages/database/src/client.ts';
import {PrismaRepositories} from '../../packages/database/src/prisma-repositories.ts';

const databaseUrl=process.env.DATABASE_URL_TEST;
if(!databaseUrl||!new URL(databaseUrl).pathname.endsWith('_test'))throw new Error('DATABASE_URL_TEST must point to a _test database');
test('postgres stores workspace notification channels',async()=>{
  const client=createPrismaClient(databaseUrl),repos=new PrismaRepositories(client),suffix=`${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const workspaceId='w-'+suffix,channelId='n-'+suffix;
  try{
    await repos.workspaces.insert({id:workspaceId,name:'W'});
    await repos.notificationChannels.insert({id:channelId,workspaceId,kind:'EMAIL',target:'owner@example.test',enabled:true});
    assert.equal((await repos.notificationChannels.findBy({workspaceId}))[0]?.target,'owner@example.test');
    await repos.notificationChannels.update(channelId,{enabled:false});
    assert.equal((await repos.notificationChannels.get(channelId))?.enabled,false);
  }finally{await repos.notificationChannels.remove(channelId);await repos.workspaces.remove(workspaceId);await client.$disconnect()}
});
