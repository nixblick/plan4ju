"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { APIError } from "better-auth/api";
import { auth } from "@/server/auth";
import { baseUrl } from "@/server/env";
import { ConflictError, ForbiddenError, InvalidInvitationError, NotFoundError, RateLimitError } from "@/server/errors";
import { assertBelowLimit, clearLimit, LOGIN_FAILURES, loginFailureKey, rateLimit, recordHit } from "@/server/ratelimit";
import { clientIp as trustedClientIp, withClientIp } from "@/server/client-ip";
import { registerWithInvitation } from "@/server/onboarding";
import { sendMailInBackground } from "@/server/mail";
import { acceptInvitation, createInvitation, revokeInvitation } from "@/server/services/invitations";
import { addChildProfile, changeMemberRole, deleteChildProfile, removeMember } from "@/server/services/members";
import { clearActiveFamily, requireFamily, requireUser, setActiveFamily } from "@/server/session";
import { safeNext } from "@/lib/safe-next";

const text = (f: FormData, k: string) => String(f.get(k) ?? "");
const MIN = 60 * 1000;

function clientIp(h: Headers): string {
  return trustedClientIp(h) ?? "unknown";
}

/** Redirects back with a short error code; the page maps it to a German message. */
function back(path: string, code: string): never {
  redirect(`${path}${path.includes("?") ? "&" : "?"}fehler=${code}`);
}

function codeFor(e: unknown): string {
  if (e instanceof RateLimitError) return "zu-viele";
  if (e instanceof ForbiddenError) return "verboten";
  if (e instanceof ConflictError) return "konflikt";
  if (e instanceof NotFoundError) return "nicht-gefunden";
  if (e instanceof InvalidInvitationError) return "einladung";
  if (e instanceof Error && e.name === "ZodError") return "eingabe";
  throw e;
}

// ---- Login, logout, reset ------------------------------------------------------------

export async function loginAction(form: FormData) {
  const email = text(form, "email").trim().toLowerCase();
  const next = safeNext(text(form, "weiter"));
  const nextQ = next ? `&weiter=${encodeURIComponent(next)}` : "";
  const h = withClientIp(await headers());
  const ip = clientIp(h);
  const failKey = loginFailureKey(email, ip);
  let failure: string | null = null;
  try {
    rateLimit(`login:ip:${ip}`, 20, 15 * MIN);
    assertBelowLimit(failKey, LOGIN_FAILURES.max);
    await auth.api.signInEmail({ body: { email, password: text(form, "password") }, headers: h });
    clearLimit(failKey);
  } catch (e) {
    if (e instanceof APIError && e.status !== "FORBIDDEN") recordHit(failKey, LOGIN_FAILURES.windowMs);
    if (e instanceof RateLimitError) failure = "zu-viele";
    else if (e instanceof APIError && e.status === "FORBIDDEN") failure = "unbestaetigt";
    else if (e instanceof APIError) failure = "ungueltig";
    else throw e;
  }
  if (failure) redirect(`/anmelden?fehler=${failure}${nextQ}`);
  redirect(next ?? "/familie-waehlen");
}

export async function logoutAction() {
  await auth.api.signOut({ headers: await headers() });
  await clearActiveFamily();
  redirect("/anmelden");
}

export async function requestResetAction(form: FormData) {
  const email = text(form, "email").trim().toLowerCase();
  const h = withClientIp(await headers());
  try {
    rateLimit(`reset:ip:${clientIp(h)}`, 10, 15 * MIN);
    rateLimit(`reset:mail:${email}`, 3, 15 * MIN);
    await auth.api.requestPasswordReset({ body: { email, redirectTo: `${baseUrl()}/passwort-zuruecksetzen` }, headers: h });
  } catch (e) {
    if (e instanceof RateLimitError) back("/passwort-vergessen", "zu-viele");
    // Same answer for unknown addresses and other errors: no account enumeration.
  }
  redirect("/passwort-vergessen?gesendet=1");
}

export async function resetPasswordAction(form: FormData) {
  const token = text(form, "token");
  const h = withClientIp(await headers());
  let failure: string | null = null;
  try {
    rateLimit(`resetdo:ip:${clientIp(h)}`, 10, 15 * MIN);
    await auth.api.resetPassword({ body: { newPassword: text(form, "newPassword"), token }, headers: h });
  } catch (e) {
    if (e instanceof RateLimitError) failure = "zu-viele";
    else if (e instanceof APIError) failure = "ungueltig";
    else throw e;
  }
  if (failure) redirect(`/passwort-zuruecksetzen?token=${encodeURIComponent(token)}&fehler=${failure}`);
  redirect("/anmelden?zurueckgesetzt=1");
}

// ---- Invitation ----------------------------------------------------------------------

export async function registerAction(form: FormData) {
  const token = text(form, "token");
  const path = `/einladung/${encodeURIComponent(token)}`;
  const h = withClientIp(await headers());
  let joined: { familyId: string; userId: string } | null = null;
  let failure: string | null = null;
  try {
    rateLimit(`register:ip:${clientIp(h)}`, 10, 15 * MIN);
    joined = await registerWithInvitation({ token, name: text(form, "name"), phrase: text(form, "password") }, h);
  } catch (e) {
    failure = codeFor(e);
  }
  if (failure || !joined) back(path, failure ?? "einladung");
  // The session cookie was only just set; it is not visible in this request's headers.
  await setActiveFamily({ id: joined.userId }, joined.familyId);
  redirect("/");
}

export async function acceptAction(form: FormData) {
  const token = text(form, "token");
  const user = await requireUser();
  let familyId: string | null = null;
  let failure: string | null = null;
  try {
    familyId = await acceptInvitation(user.id, token);
  } catch (e) {
    failure = codeFor(e);
  }
  if (failure || !familyId) back(`/einladung/${encodeURIComponent(token)}`, failure ?? "einladung");
  await setActiveFamily(user, familyId);
  redirect("/");
}

// ---- Active family -------------------------------------------------------------------

export async function chooseFamilyAction(form: FormData) {
  const user = await requireUser();
  let failure: string | null = null;
  try {
    await setActiveFamily(user, text(form, "familyId"));
  } catch (e) {
    failure = codeFor(e);
  }
  if (failure) back("/familie-waehlen", failure);
  redirect("/");
}

// ---- Members, invitations, child profiles ---------------------------------------------

const MEMBERS = "/familie/mitglieder";

async function manage(run: (a: Awaited<ReturnType<typeof requireFamily>>) => Promise<string | void>) {
  const active = await requireFamily();
  let failure: string | null = null;
  let ok: string | void = undefined;
  try {
    ok = await run(active);
  } catch (e) {
    failure = codeFor(e);
  }
  revalidatePath(MEMBERS);
  if (failure) back(MEMBERS, failure);
  redirect(ok ? `${MEMBERS}?ok=${ok}` : MEMBERS);
}

export async function inviteAction(form: FormData) {
  await manage(async (a) => {
    const inv = await createInvitation(a.user.id, a.familyId, {
      email: text(form, "email"),
      role: text(form, "role") === "ADMIN" ? "ADMIN" : "MEMBER",
    });
    sendMailInBackground({
      to: inv.email,
      subject: "Einladung zu Plan4JU",
      text: `${a.user.name} lädt dich zu Plan4JU ein.\n\nÜber diesen Link kannst du die Einladung annehmen (7 Tage gültig, einmal verwendbar):\n${baseUrl()}/einladung/${inv.token}\n`,
    });
    return "eingeladen";
  });
}

export async function revokeAction(form: FormData) {
  await manage(async (a) => {
    await revokeInvitation(a.user.id, a.familyId, text(form, "id"));
    return "widerrufen";
  });
}

export async function roleAction(form: FormData) {
  await manage(async (a) => {
    const role = text(form, "role");
    if (role !== "OWNER" && role !== "ADMIN" && role !== "MEMBER") throw new ForbiddenError();
    await changeMemberRole(a.user.id, a.familyId, text(form, "userId"), role);
    return "rolle";
  });
}

export async function removeMemberAction(form: FormData) {
  await manage(async (a) => {
    await removeMember(a.user.id, a.familyId, text(form, "userId"));
    return "entfernt";
  });
}

export async function addChildAction(form: FormData) {
  await manage(async (a) => {
    await addChildProfile(a.user.id, a.familyId, text(form, "displayName"));
    return "kind";
  });
}

export async function deleteChildAction(form: FormData) {
  await manage(async (a) => {
    await deleteChildProfile(a.user.id, a.familyId, text(form, "profileId"));
    return "kind-weg";
  });
}
