import {defineConfig} from 'prisma/config';

// Generation validates the schema without connecting; migrations still use DATABASE_URL when supplied.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {path: 'prisma/migrations'},
  datasource: {url: process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:5432/social_v1'},
});
