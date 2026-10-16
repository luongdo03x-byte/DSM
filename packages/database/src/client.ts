import {PrismaPg} from '@prisma/adapter-pg';
import {PrismaClient} from './generated/prisma/client.ts';

export {PrismaClient};

export function createPrismaClient(databaseUrl: string): PrismaClient {
  return new PrismaClient({adapter: new PrismaPg({connectionString: databaseUrl})});
}
