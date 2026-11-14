import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type { FamilyRole } from "@prisma/client";
import { auth } from "./auth";
import { isSecureDeployment } from "./env";
import { ForbiddenError } from "./errors";
import { FAMILY_COOKIE, readFamilyChoice, signFamilyChoice } from "./familyCookie";
import { listFamiliesForUser } from "./services/families";
import { withFamily } from "./tenant";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
}

// Layout and page both ask for the session and the family; cache() makes that one lookup per request.
// No Better Auth cookie cache on purpose: it would delay "sign out everywhere" by its max age.
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const s = await auth.api.getSession({ headers: await headers() });
  return s ? { id: s.user.id, name: s.user.name, email: s.user.email } : null;
});

/** Role of the user in the family, read once per request; ForbiddenError without a membership. */
const membershipRole = cache((userId: string, familyId: string): Promise<FamilyRole> => withFamily(userId, familyId, async (ctx) => ctx.role));

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/anmelden");
  return user;
}

/** Remembers the active family after verifying the membership on the server. */
export async function setActiveFamily(user: { id: string }, familyId: string): Promise<void> {
  const mine = await listFamiliesForUser(user.id);
  if (!mine.some((m) => m.family.id === familyId)) throw new ForbiddenError("Not a member of this family");
  (await cookies()).set(FAMILY_COOKIE, signFamilyChoice(user.id, familyId), {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureDeployment(),
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearActiveFamily(): Promise<void> {
  (await cookies()).delete(FAMILY_COOKIE);
}

export interface ActiveFamily {
  user: SessionUser;
  familyId: string;
  role: FamilyRole;
}

/**
 * Signed-in user plus verified active family. The cookie only names the family; the
 * membership and the role are read from the database on every request. Without a valid
 * choice (or after removal from the family) the user goes to the family picker.
 */
export async function requireFamily(): Promise<ActiveFamily> {
  const user = await requireUser();
  const familyId = readFamilyChoice(user.id, (await cookies()).get(FAMILY_COOKIE)?.value);
  if (!familyId) redirect("/familie-waehlen");
  try {
    const role = await membershipRole(user.id, familyId);
    return { user, familyId, role };
  } catch (e) {
    if (e instanceof ForbiddenError) redirect("/familie-waehlen");
    throw e;
  }
}

/** The verified active family of a signed-in user, or null (no redirect; e.g. for the layout). */
export async function activeFamilyId(user: SessionUser): Promise<string | null> {
  const familyId = readFamilyChoice(user.id, (await cookies()).get(FAMILY_COOKIE)?.value);
  if (!familyId) return null;
  try {
    await membershipRole(user.id, familyId);
    return familyId;
  } catch (e) {
    if (e instanceof ForbiddenError) return null;
    throw e;
  }
}
