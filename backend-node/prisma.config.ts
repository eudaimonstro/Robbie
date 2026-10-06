/**
 * Prisma CLI configuration (migrate, generate, studio)
 *
 * The CLI connects with DIRECT_URL when set (bypassing any connection pooler),
 * otherwise DATABASE_URL. The app's runtime connection is configured in
 * src/db/prisma.ts. Variables are read directly rather than with env(), which
 * throws when unset, because `prisma generate` must work without a database.
 */

import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? '',
  },
});
