import { PrismaClient } from "@prisma/client";

// Application client: connects as the restricted role (DATABASE_URL), RLS applies.
// Never use it outside withFamily()/withUser() for family data.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
