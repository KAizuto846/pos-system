import { Prisma, PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  prismaInit: Promise<void> | undefined;
  prismaMiddlewareRegistered: boolean | undefined;
};

function createPrismaClient() {
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();
globalForPrisma.prisma = prisma;

function isInitializationPragma(params: Prisma.MiddlewareParams) {
  if (params.action !== "executeRaw" && params.action !== "queryRaw") return false;
  const query = Array.isArray(params.args) ? params.args[0] : undefined;
  return typeof query === "string" && query.trimStart().toUpperCase().startsWith("PRAGMA ");
}

export function initializePrisma(): Promise<void> {
  if (!globalForPrisma.prismaInit) {
    globalForPrisma.prismaInit = (async () => {
      await prisma.$queryRawUnsafe("PRAGMA journal_mode = WAL");
      await prisma.$executeRawUnsafe("PRAGMA synchronous = NORMAL");
      await prisma.$executeRawUnsafe("PRAGMA foreign_keys = ON");
      await prisma.$executeRawUnsafe("PRAGMA busy_timeout = 5000");
    })();
  }

  return globalForPrisma.prismaInit;
}

if (!globalForPrisma.prismaMiddlewareRegistered) {
  prisma.$use(async (params, next) => {
    if (!isInitializationPragma(params)) await initializePrisma();
    return next(params);
  });
  globalForPrisma.prismaMiddlewareRegistered = true;
}
