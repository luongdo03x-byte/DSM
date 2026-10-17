import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {createPrismaClient} from '../../packages/database/src/client.ts';
import {PrismaRepositories} from '../../packages/database/src/prisma-repositories.ts';
import {MetaDataDeletionService} from '../../apps/api/src/modules/integrations/meta-data-deletion.service.ts';

const databaseUrl=process.env.DATABASE_URL_TEST;if(!databaseUrl||!new URL(databaseUrl).pathname.endsWith('_test'))throw new Error('DATABASE_URL_TEST must point to a _test database');
test('postgres Meta deletion removes credential and scrubs account identity',async()=>{
  const client=createPrismaClient(databaseUrl),repos=new PrismaRepositories(client),suffix=`${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const workspaceId='w-'+suffix,brandId='b-'+suffix,accountId='a-'+suffix,credentialId='c-'+suffix;
  try{
    await repos.workspaces.insert({id:workspaceId,name:'W'});
    await repos.brands.insert({id:brandId,workspaceId,name:'B',slug:brandId,language:'en',timezone:'UTC',currency:'USD',status:'ACTIVE'});
    await repos.socialAccounts.insert({id:accountId,brandId,platform:'FACEBOOK',platformAccountId:'page-id',username:'user',displayName:'Name',publishMode:'API',status:'CONNECTED'});
    await repos.credentials.insert({id:credentialId,socialAccountId:accountId,provider:'META',ciphertext:'secret',iv:'iv',authTag:'tag',providerUserId:'meta-'+suffix});
    const payload=Buffer.from(JSON.stringify({algorithm:'HMAC-SHA256',user_id:'meta-'+suffix})).toString('base64url');const signed=createHmac('sha256','app-secret').update(payload).digest('base64url')+'.'+payload;
    await new MetaDataDeletionService({repos,appSecret:'app-secret',statusBaseUrl:'https://dsm.test/data-deletion'}).handle(signed);
    const account=await repos.socialAccounts.get(accountId);assert.equal(account?.status,'DISCONNECTED');assert.equal(account?.platformAccountId,undefined);assert.equal(account?.username,undefined);
    assert.equal((await repos.credentials.findBy({socialAccountId:accountId})).length,0);
  }finally{await repos.credentials.remove(credentialId);await repos.socialAccounts.remove(accountId);await repos.brands.remove(brandId);await repos.workspaces.remove(workspaceId);await client.$disconnect()}
});
