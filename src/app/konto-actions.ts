"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { APIError } from "better-auth/api";
import { auth, MIN_PASSWORD_LENGTH } from "@/server/auth";
import { RateLimitError } from "@/server/errors";
import { rateLimit } from "@/server/ratelimit";
import { clearActiveFamily, requireUser } from "@/server/session";
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
