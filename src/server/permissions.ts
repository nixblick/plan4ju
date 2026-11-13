import type { FamilyRole } from "@prisma/client";
import { ForbiddenError } from "./errors";
import type { FamilyContext } from "./tenant";

const rank: Record<FamilyRole, number> = { MEMBER: 1, ADMIN: 2, OWNER: 3 };

export function atLeast(role: FamilyRole, min: FamilyRole): boolean {
  return rank[role] >= rank[min];
}

/** Server side authorization; the UI hides buttons, this is what actually protects. */
export function assertRole(ctx: Pick<FamilyContext, "role">, min: FamilyRole): void {
  if (!atLeast(ctx.role, min)) throw new ForbiddenError("Insufficient role");
}

/** OWNER grants any role, ADMIN may only grant MEMBER, MEMBER nothing. */
export function canGrant(actor: FamilyRole, target: FamilyRole): boolean {
  if (actor === "OWNER") return true;
  if (actor === "ADMIN") return target === "MEMBER";
  return false;
}

/** OWNER may manage everyone, ADMIN only plain members. */
export function canManage(actor: FamilyRole, target: FamilyRole): boolean {
  if (actor === "OWNER") return true;
  if (actor === "ADMIN") return target === "MEMBER";
  return false;
}
