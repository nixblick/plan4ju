import { withUser } from "../tenant";
import type { PrismaClient } from "@prisma/client";

/** Families the user belongs to (for choosing the active family). */
export function listFamiliesForUser(userId: string, client?: PrismaClient) {
  return withUser(
    userId,
    (tx) =>
      tx.familyMembership.findMany({
        where: { userId },
        select: { role: true, family: { select: { id: true, name: true } } },
        orderBy: { createdAt: "asc" },
      }),
    client,
  );
}
