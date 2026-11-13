import type { FamilyRole, Prisma, PrismaClient } from "@prisma/client";
import { prisma as defaultClient } from "./db";
import { ForbiddenError } from "./errors";

export type Tx = Prisma.TransactionClient;

export interface FamilyContext {
  tx: Tx;
  userId: string;
  familyId: string;
  role: FamilyRole;
}

async function setContext(tx: Tx, userId: string, familyId: string | null): Promise<void> {
  // set_config(..., true) is SET LOCAL: discarded at COMMIT/ROLLBACK, so the
  // context cannot survive on a pooled connection.
  await tx.$executeRaw`SELECT set_config('app.user_id', ${userId}, true)`;
  await tx.$executeRaw`SELECT set_config('app.family_id', ${familyId ?? ""}, true)`;
}

/**
 * Runs `fn` in one transaction with the family context set and the user's
 * membership verified. The family id must come from the server-side session
 * (active family), never straight from client input. Without a membership the
 * call throws ForbiddenError and nothing is executed.
 */
export async function withFamily<T>(
  userId: string,
  familyId: string,
  fn: (ctx: FamilyContext) => Promise<T>,
  client: PrismaClient = defaultClient,
): Promise<T> {
  return client.$transaction(async (tx) => {
    await setContext(tx, userId, familyId);
    const membership = await tx.familyMembership.findUnique({
      where: { familyId_userId: { familyId, userId } },
    });
    if (!membership) throw new ForbiddenError("Not a member of this family");
    return fn({ tx, userId, familyId, role: membership.role });
  });
}

/** User-level context without an active family, e.g. for the family picker after login. */
export async function withUser<T>(
  userId: string,
  fn: (tx: Tx) => Promise<T>,
  client: PrismaClient = defaultClient,
): Promise<T> {
  return client.$transaction(async (tx) => {
    await setContext(tx, userId, null);
    return fn(tx);
  });
}
