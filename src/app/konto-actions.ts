"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { APIError } from "better-auth/api";
import { auth, MIN_PASSWORD_LENGTH } from "@/server/auth";
import { RateLimitError } from "@/server/errors";
import { rateLimit } from "@/server/ratelimit";
import { verify } from "@node-rs/argon2";
import { prisma } from "@/server/db";
import { ConflictError, ForbiddenError } from "@/server/errors";
import { forgetKnownDevices } from "@/server/ratelimit";
import { deleteFamily, deleteOwnAccount } from "@/server/services/privacy";
import { withFamily } from "@/server/tenant";
import { activeFamilyId, clearActiveFamily, requireUser } from "@/server/session";
import { text } from "./action-helpers";

const MIN = 60 * 1000;

/**
 * Changes the password (current one required) and ends every other session. The database trigger
 * rotates the security stamp, so known devices of the login brake no longer count. Direct auth.api
 * calls are not covered by the HTTP limiter: 5 attempts per user in 15 minutes.
 */
export async function changePasswordAction(form: FormData) {
  const user = await requireUser();
  const current = text(form, "current");
  const next = text(form, "next");
  if (next.length < MIN_PASSWORD_LENGTH || next.length > 128 || next !== text(form, "repeat")) redirect("/konto?fehler=eingabe-konto");
  let failure: string | null = null;
  try {
    rateLimit(`password-change:${user.id}`, 5, 15 * MIN);
    await auth.api.changePassword({ body: { currentPassword: current, newPassword: next, revokeOtherSessions: true }, headers: await headers() });
  } catch (e) {
    if (e instanceof RateLimitError) failure = "zu-viele";
    else if (e instanceof APIError) failure = "kennwort-falsch";
    else throw e;
  }
  redirect(failure ? `/konto?fehler=${failure}` : "/konto?ok=kennwort");
}

/** Ends every session of this user, including this one, and rotates the security stamp (auth hook). */
export async function signOutEverywhereAction() {
  await requireUser();
  await auth.api.revokeSessions({ headers: await headers() });
  await clearActiveFamily();
  redirect("/anmelden?ok=ueberall-abgemeldet");
}

async function credentialMatches(userId: string, given: string): Promise<boolean> {
  if (!given || given.length > 128) return false;
  // Auth tables carry no family data and no row level security (migration row_level_security).
  const acc = await prisma.account.findFirst({ where: { userId, providerId: "credential" } });
  const stored = acc?.password;
  if (!stored) return false;
  try {
    return await verify(stored, given);
  } catch {
    return false;
  }
}

/** Deletes the own account after the credential check (docs/datenschutz.md). 5 attempts in 15 minutes. */
export async function deleteAccountAction(form: FormData) {
  const user = await requireUser();
  let failure: string | null = null;
  try {
    rateLimit(`account-delete:${user.id}`, 5, 15 * MIN);
    if (text(form, "confirm") !== "ja") failure = "bestaetigung-fehlt";
    else if (!(await credentialMatches(user.id, text(form, "kennwort")))) failure = "kennwort-falsch";
    else await deleteOwnAccount(user.id);
  } catch (e) {
    if (e instanceof RateLimitError) failure = "zu-viele";
    else if (e instanceof ConflictError) failure = "letzter-owner";
    else throw e;
  }
  if (failure) redirect(`/konto?fehler=${failure}`);
  forgetKnownDevices(user.email);
  await clearActiveFamily();
  redirect("/anmelden?ok=konto-geloescht");
}

/** OWNER deletes the active family; confirmation by typing its exact name. */
export async function deleteFamilyAction(form: FormData) {
  const user = await requireUser();
  const familyId = await activeFamilyId(user);
  if (!familyId) redirect("/familie-waehlen");
  let failure: string | null = null;
  try {
    rateLimit(`family-delete:${user.id}`, 5, 15 * MIN);
    const name = await withFamily(user.id, familyId, async ({ tx }) => (await tx.family.findUniqueOrThrow({ where: { id: familyId } })).name);
    if (text(form, "name").trim() !== name.trim()) failure = "familienname-falsch";
    else await deleteFamily(user.id, familyId);
  } catch (e) {
    if (e instanceof RateLimitError) failure = "zu-viele";
    else if (e instanceof ForbiddenError) failure = "keine-berechtigung";
    else throw e;
  }
  if (failure) redirect(`/konto?fehler=${failure}`);
  await clearActiveFamily();
  redirect("/familie-waehlen?ok=familie-geloescht");
}
