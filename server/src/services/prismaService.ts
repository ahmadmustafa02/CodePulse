/** Prisma client singleton using the Neon HTTP driver adapter (no native query engine). */

import { PrismaClient } from '@prisma/client';
import { PrismaNeonHTTP } from '@prisma/adapter-neon';
import { neon } from '@neondatabase/serverless';

const globalForPrisma = global as unknown as { prisma: PrismaClient };

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL!;
  const sql = neon(connectionString);
  const adapter = new PrismaNeonHTTP(sql);
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma || createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
