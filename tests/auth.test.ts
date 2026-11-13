import { randomBytes } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { admin, app } from "./helpers";
import { auth, handleAuthRequest, invitationSignUp } from "../src/server/auth";
import { createFamilyWithOwnerInvitation } from "../src/server/admin";
import { ConflictError, InvalidInvitationError, RateLimitError } from "../src/server/errors";
import { readFamilyChoice, signFamilyChoice } from "../src/server/familyCookie";
import { registerWithInvitation } from "../src/server/onboarding";
import { rateLimit, resetRateLimits } from "../src/server/ratelimit";
import { createInvitation, revokeInvitation } from "../src/server/services/invitations";
import { hashToken } from "../src/server/tokens";
import { withFamily } from "../src/server/tenant";

const sfx = Math.random().toString(36).slice(2, 8);
const mail = (k: string) => `${k}-${sfx}@example.test`;
// Random per run: no credential literal in the repository.
const fresh = () => "Tst-" + randomBytes(12).toString("base64url");
const PW = fresh();
const headers = new Headers({ "x-forwarded-for": "203.0.113.9" });

const families: string[] = [];
const emails: string[] = [];

const mailpit = `http://localhost:${process.env.MAILPIT_UI_PORT}/api/v1`;

async function messagesTo(address: string, timeoutMs = 8000): Promise<string[]> {
  const until = Date.now() + timeoutMs;
  for (;;) {
    const res = await fetch(`${mailpit}/search?query=${encodeURIComponent(`to:${address}`)}`);
    const body = (await res.json()) as { messages?: { ID: string }[] };
    if (body.messages?.length) {
      return Promise.all(
        body.messages.map(async (m) => ((await (await fetch(`${mailpit}/message/${m.ID}`)).json()) as { Text: string }).Text),
      );
    }
    if (Date.now() > until) return [];
    await new Promise((r) => setTimeout(r, 200));
  }
}

async function newFamily(ownerEmail: string) {
  emails.push(ownerEmail);
  const r = await createFamilyWithOwnerInvitation(admin, { name: `Familie Muster ${sfx}`, ownerEmail });
  families.push(r.familyId);
  return r;
}

beforeAll(async () => {
  const r = await fetch(`${mailpit}/info`);
  if (!r.ok) throw new Error("Mailpit is not running (npm run db:up)");
});
afterEach(() => resetRateLimits());
afterAll(async () => {
  for (const e of emails) await fetch(`${mailpit}/search?query=${encodeURIComponent(`to:${e}`)}`, { method: "DELETE" });
  await admin.family.deleteMany({ where: { id: { in: families } } });
  await admin.user.deleteMany({ where: { email: { in: emails } } });
  await app.$disconnect();
  await admin.$disconnect();
});

describe("registration is by invitation only", () => {
  it("direct sign-up through the API is refused and creates nothing", async () => {
    const email = mail("wild");
    emails.push(email);
    // Better Auth answers a refused sign-up with a generic success body (no enumeration);
    // what counts is that no account is created.
    await auth.api.signUpEmail({ body: { email, password: PW, name: "Wild" } }).catch(() => undefined);
    expect(await admin.user.count({ where: { email } })).toBe(0);
    const res = await auth.handler(
      new Request("http://localhost:3000/api/auth/sign-up/email", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost:3000", "x-forwarded-for": "198.51.100.1" },
        body: JSON.stringify({ email, password: PW, name: "Wild" }),
      }),
    );
    expect(res.status).not.toBe(500);
    expect(await admin.user.count({ where: { email } })).toBe(0);
  });

  it("an invitation for one address does not open sign-up for another", async () => {
    const other = mail("other");
    emails.push(other);
    await invitationSignUp
      .run({ email: mail("someone") }, () => auth.api.signUpEmail({ body: { email: other, password: PW, name: "X" } }))
      .catch(() => undefined);
    expect(await admin.user.count({ where: { email: other } })).toBe(0);
  });
});

describe("invitation flow", () => {
  it("instance admin -> owner registers, passwords are Argon2id, token works once", async () => {
    const email = mail("owner");
    const fam = await newFamily(email);
    const joined = await registerWithInvitation({ token: fam.token, name: "Olga Owner", phrase: PW }, headers);
    expect(joined.familyId).toBe(fam.familyId);

    const user = await admin.user.findUniqueOrThrow({ where: { email } });
    expect(user.emailVerified).toBe(true);
    const account = await admin.account.findFirstOrThrow({ where: { userId: user.id } });
    expect(account.password).toMatch(/^\$argon2id\$/);
    expect(account.password).not.toContain(PW);
    expect(await withFamily(user.id, fam.familyId, async (c) => c.role)).toBe("OWNER");
    expect((await admin.familyProfile.findFirstOrThrow({ where: { familyId: fam.familyId, userId: user.id } })).displayName).toBe("Olga Owner");

    // the token is consumed
    await expect(registerWithInvitation({ token: fam.token, name: "Zweiter", phrase: PW }, headers)).rejects.toBeInstanceOf(InvalidInvitationError);

    // login works with the right credential only
    const ok = await auth.api.signInEmail({ body: { email, password: PW }, headers });
    expect(ok.user.id).toBe(user.id);
    await expect(auth.api.signInEmail({ body: { email, password: PW + "x" }, headers })).rejects.toThrow();
  });

  it("owner invites a member who registers; invitations of a taken address say sign in", async () => {
    const owner = mail("o2");
    const fam = await newFamily(owner);
    const ownerId = (await registerWithInvitation({ token: fam.token, name: "O Zwei", phrase: PW }, headers)).userId;
    const guest = mail("guest");
    emails.push(guest);
    const inv = await createInvitation(ownerId, fam.familyId, { email: guest });
    const g = await registerWithInvitation({ token: inv.token, name: "Gast Muster", phrase: PW }, headers);
    expect(await withFamily(g.userId, fam.familyId, async (c) => c.role)).toBe("MEMBER");

    // guest later gets a second invitation to the first family: account exists -> no new sign-up
    const fam2 = await newFamily(mail("o3"));
    const inv2 = await createInvitation(
      (await registerWithInvitation({ token: fam2.token, name: "O Drei", phrase: PW }, headers)).userId,
      fam2.familyId,
      { email: guest },
    );
    await expect(registerWithInvitation({ token: inv2.token, name: "Gast", phrase: PW }, headers)).rejects.toBeInstanceOf(ConflictError);
  });

  it("revoked and expired invitations cannot register", async () => {
    const fam = await newFamily(mail("o4"));
    const ownerId = (await registerWithInvitation({ token: fam.token, name: "O Vier", phrase: PW }, headers)).userId;
    const a = mail("rev");
    const b = mail("exp");
    emails.push(a, b);
    const ia = await createInvitation(ownerId, fam.familyId, { email: a });
    const ib = await createInvitation(ownerId, fam.familyId, { email: b });
    await revokeInvitation(ownerId, fam.familyId, ia.id);
    await admin.familyInvitation.update({ where: { tokenHash: hashToken(ib.token) }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await expect(registerWithInvitation({ token: ia.token, name: "R", phrase: PW }, headers)).rejects.toBeInstanceOf(InvalidInvitationError);
    await expect(registerWithInvitation({ token: ib.token, name: "E", phrase: PW }, headers)).rejects.toBeInstanceOf(InvalidInvitationError);
    expect(await admin.user.count({ where: { email: { in: [a, b] } } })).toBe(0);
  });

  it("a too short credential is refused before any account exists", async () => {
    const email = mail("short");
    const fam = await newFamily(email);
    await expect(registerWithInvitation({ token: fam.token, name: "Kurz", phrase: "kurz" }, headers)).rejects.toThrow();
    expect(await admin.user.count({ where: { email } })).toBe(0);
    expect((await admin.familyInvitation.findUniqueOrThrow({ where: { tokenHash: hashToken(fam.token) } })).acceptedAt).toBeNull();
  });

  it("one account can belong to several families and every family needs its own membership", async () => {
    const shared = mail("shared");
    const famA = await newFamily(shared);
    const ownerA = (await registerWithInvitation({ token: famA.token, name: "Doppel", phrase: PW }, headers)).userId;
    const famB = await newFamily(mail("ob"));
    const ownerB = (await registerWithInvitation({ token: famB.token, name: "O B", phrase: PW }, headers)).userId;
    const inv = await createInvitation(ownerB, famB.familyId, { email: shared });
    const { acceptInvitation } = await import("../src/server/services/invitations");
    await acceptInvitation(ownerA, inv.token);
    const { listFamiliesForUser } = await import("../src/server/services/families");
    expect((await listFamiliesForUser(ownerA)).map((m) => m.family.id).sort()).toEqual([famA.familyId, famB.familyId].sort());
    // a family that was never joined stays closed
    const famC = await newFamily(mail("oc"));
    await expect(withFamily(ownerA, famC.familyId, async () => 1)).rejects.toThrow(/Not a member/);
  });
});

describe("e-mail verification and password reset (Mailpit)", () => {
  async function verifiedUser(key: string) {
    const email = mail(key);
    const fam = await newFamily(email);
    const j = await registerWithInvitation({ token: fam.token, name: `Muster ${key}`, phrase: PW }, headers);
    return { email, ...j };
  }

  it("an unverified account cannot sign in and gets a verification mail", async () => {
    const u = await verifiedUser("unv");
    await admin.user.update({ where: { id: u.userId }, data: { emailVerified: false } });
    await expect(auth.api.signInEmail({ body: { email: u.email, password: PW }, headers })).rejects.toMatchObject({ status: "FORBIDDEN" });
    const texts = await messagesTo(u.email);
    expect(texts.join("\n")).toMatch(/verify-email\?token=/);
  });

  it("reset: mail with link, new credential works, old one stops, link is single use", async () => {
    const u = await verifiedUser("rst");
    await auth.api.signInEmail({ body: { email: u.email, password: PW }, headers });
    expect(await admin.session.count({ where: { userId: u.userId } })).toBeGreaterThan(0);
    await auth.api.requestPasswordReset({ body: { email: u.email, redirectTo: "http://localhost:3000/passwort-zuruecksetzen" }, headers });
    const text = (await messagesTo(u.email)).join("\n");
    const m = text.match(/reset-password\/([A-Za-z0-9_-]+)/);
    expect(m).not.toBeNull();
    const token = m![1]!;
    const NEW = fresh();
    await auth.api.resetPassword({ body: { newPassword: NEW, token }, headers });
    expect(await admin.session.count({ where: { userId: u.userId } })).toBe(0);
    await expect(auth.api.signInEmail({ body: { email: u.email, password: PW }, headers })).rejects.toThrow();
    await expect(auth.api.signInEmail({ body: { email: u.email, password: NEW }, headers })).resolves.toBeTruthy();
    await expect(auth.api.resetPassword({ body: { newPassword: fresh(), token }, headers })).rejects.toThrow();
    const hashed = (await admin.account.findFirstOrThrow({ where: { userId: u.userId } })).password;
    expect(hashed).toMatch(/^\$argon2id\$/);
  });

  it("reset for an unknown address sends nothing and does not reveal it", async () => {
    const ghost = mail("ghost");
    emails.push(ghost);
    await expect(
      auth.api.requestPasswordReset({ body: { email: ghost, redirectTo: "http://localhost:3000/passwort-zuruecksetzen" }, headers }),
    ).resolves.toBeTruthy();
    expect(await messagesTo(ghost, 1500)).toEqual([]);
  });
});

describe("rate limits", () => {
  it("HTTP sign-in is limited per trusted client address; a spoofed left X-Forwarded-For does not help", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 8; i++) {
      const res = await handleAuthRequest(
        new Request("http://localhost:3000/api/auth/sign-in/email", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin: "http://localhost:3000",
            "x-forwarded-for": `192.0.2.${i + 1}, 198.51.100.77`,
            "x-plan4ju-client-ip": `192.0.2.${i + 100}`,
          },
          body: JSON.stringify({ email: mail("nobody"), password: fresh() }),
        }),
      );
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 5).every((s) => s === 401)).toBe(true); // body reached Better Auth
    expect(statuses.slice(5)).toContain(429);
  });

  it("HTTP password reset requests are limited", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await auth.handler(
        new Request("http://localhost:3000/api/auth/request-password-reset", {
          method: "POST",
          headers: { "content-type": "application/json", origin: "http://localhost:3000", "x-forwarded-for": "198.51.100.88" },
          body: JSON.stringify({ email: mail("nobody2"), redirectTo: "http://localhost:3000/passwort-zuruecksetzen" }),
        }),
      );
      statuses.push(res.status);
    }
    expect(statuses).toContain(429);
  });

  it("the server action limiter blocks after the maximum and recovers after the window", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 5; i++) rateLimit("k", 5, 60_000, t0);
    expect(() => rateLimit("k", 5, 60_000, t0)).toThrow(RateLimitError);
    expect(() => rateLimit("other", 5, 60_000, t0)).not.toThrow();
    expect(() => rateLimit("k", 5, 60_000, t0 + 60_001)).not.toThrow();
  });
});

describe("active family choice", () => {
  it("is bound to the user and cannot be forged", () => {
    const c = signFamilyChoice("user-1", "fam-1");
    expect(readFamilyChoice("user-1", c)).toBe("fam-1");
    expect(readFamilyChoice("user-2", c)).toBeNull();
    expect(readFamilyChoice("user-1", c.replace("fam-1", "fam-2"))).toBeNull();
    expect(readFamilyChoice("user-1", "fam-1.AAAA")).toBeNull();
    expect(readFamilyChoice("user-1", undefined)).toBeNull();
    expect(readFamilyChoice("user-1", "")).toBeNull();
  });
});
