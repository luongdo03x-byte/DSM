import {createPrismaClient} from '../../packages/database/src/client.ts';
import {PrismaRepositories} from '../../packages/database/src/prisma-repositories.ts';
import {runRepositoryContract} from './repository-contract.ts';

const databaseUrl = process.env.DATABASE_URL_TEST;
if (!databaseUrl) throw new Error('DATABASE_URL_TEST is required (docker compose up -d postgres)');
if (!new URL(databaseUrl).pathname.endsWith('_test')) throw new Error('DATABASE_URL_TEST must point to a _test database');

runRepositoryContract('postgres', async () => {
  const client = createPrismaClient(databaseUrl);
  await client.$connect();
  return {
    repos: new PrismaRepositories(client),
    reset: async () => {
      const tables = await client.$queryRawUnsafe<{tablename: string}[]>(`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`);
      const names = tables.map(({tablename}) => `"${tablename.replaceAll('"', '""')}"`).join(', ');
      if (names) await client.$executeRawUnsafe(`TRUNCATE TABLE ${names} RESTART IDENTITY CASCADE`);
    },
    close: async () => {await client.$disconnect()},
  };
});
