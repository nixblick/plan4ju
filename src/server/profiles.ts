import { NotFoundError } from "./errors";
import type { FamilyContext } from "./tenant";

/**
 * A former member: a login profile that lost its login link when the person left the family
 * (removeMember keeps the profile, so old tasks and routines still show the name). Child profiles
 * never had a login and stay current.
 */
export function isFormerProfile(p: { isChild: boolean; userId: string | null }): boolean {
  return !p.isChild && p.userId === null;
}

/**
 * Profile ids for an assignment: all must belong to the active family, and a former member may only
 * stay where it was assigned before (`keep`), never be assigned anew.
 */
export async function assertAssignable(ctx: FamilyContext, ids: string[], keep: Iterable<string> = []) {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return;
  const rows = await ctx.tx.familyProfile.findMany({
    where: { id: { in: unique }, familyId: ctx.familyId },
    select: { id: true, isChild: true, userId: true },
  });
  if (rows.length !== unique.length) throw new NotFoundError("Unknown profile");
  const kept = new Set(keep);
  if (rows.some((p) => isFormerProfile(p) && !kept.has(p.id))) throw new NotFoundError("Profile left the family");
}

/** Ids of former members of the active family. */
export async function formerProfileIds(ctx: FamilyContext): Promise<Set<string>> {
  const rows = await ctx.tx.familyProfile.findMany({
    where: { familyId: ctx.familyId, isChild: false, userId: null },
    select: { id: true },
  });
  return new Set(rows.map((r) => r.id));
}
