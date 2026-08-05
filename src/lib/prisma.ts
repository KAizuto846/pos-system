import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  const client = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

  // Enable SQLite optimizations on connect (only for SQLite)
  if (process.env.DATABASE_URL?.includes('sqlite') || process.env.DATABASE_URL?.startsWith('file:')) {
    client.$executeRawUnsafe('PRAGMA journal_mode=WAL');
    client.$executeRawUnsafe('PRAGMA synchronous=NORMAL');
    client.$executeRawUnsafe('PRAGMA cache_size=-65536');
    client.$executeRawUnsafe('PRAGMA temp_store=MEMORY');
    client.$executeRawUnsafe('PRAGMA mmap_size=268435456');
    client.$executeRawUnsafe('PRAGMA foreign_keys=ON');
  }

  return client;
}

export const prisma =
  globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
