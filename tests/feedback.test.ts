import { randomBytes } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { admin, app, cleanup, seed, type Fixture } from "./helpers";
import {
  deviceSummary, feedbackSubject, feedbackText, oneLine, sanitizePath, sniffImage,
} from "../src/lib/feedback";
import { RateLimitError } from "../src/server/errors";
import { resetRateLimits } from "../src/server/ratelimit";
import { InvalidImageError, submitFeedback } from "../src/server/services/feedback";
import { withFamily } from "../src/server/tenant";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 1, 2, 3]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 1, 2]);
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const mailpit = `http://localhost:${process.env.MAILPIT_UI_PORT}/api/v1`;
const sfx = randomBytes(4).toString("hex");
const TO = `feedback-${sfx}@example.org`;

describe("feedback helpers", () => {
  it("recognises PNG and JPEG by magic bytes only", () => {
    expect(sniffImage(PNG)).toBe("image/png");
    expect(sniffImage(JPEG)).toBe("image/jpeg");
    expect(sniffImage(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeNull();
    expect(sniffImage(new TextEncoder().encode("GIF89a......"))).toBeNull();
    expect(sniffImage(new Uint8Array([0x89, 0x50]))).toBeNull();
  });

  it("keeps only the path, without query, fragment or invitation token", () => {
    expect(sanitizePath("/aufgaben?token=abc#x")).toBe("/aufgaben");
    expect(sanitizePath("/einladung/SECRETTOKEN123")).toBe("/einladung/[token]");
    expect(sanitizePath("https://evil.example/x")).toBe("/");
    expect(sanitizePath("/a\nb")).toBe("/ab");
    expect(sanitizePath("/" + "x".repeat(500))).toHaveLength(200);
  });

  it("reduces the user agent to browser, system and device class", () => {
    expect(deviceSummary(UA)).toBe("Safari auf iOS (Handy)");
    expect(deviceSummary("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36")).toBe("Chrome auf Linux (Computer)");
  });

  it("subject is one line: no header injection, at most 60 characters of the text", () => {
    const s = feedbackSubject({ kind: "BUG", message: "Knopf kaputt\r\nBcc: x@example.test\n" + "y".repeat(100) });
    expect(s).not.toMatch(/[\r\n]/);
    expect(s.startsWith("[Plan4JU Feedback] Fehler: Knopf kaputt Bcc: x@example.test")).toBe(true);
    expect(s.length).toBeLessThanOrEqual(120);
    expect(oneLine("a b\u0000c", 10)).toBe("a b c");
  });

  it("mail text carries the context but no name or e-mail", () => {
    const t = feedbackText({
      kind: "IDEA", message: "<b>Mehr</b> Farben", authorName: null, pagePath: "/", appVersion: "0.2.0", device: "Chrome auf Linux (Computer)",
      screenWidth: 375, familyId: "cfamily1234abcd", role: "MEMBER", createdAt: new Date("2026-11-13T10:00:00Z"), hasImage: true,
    });
    expect(t).toContain("Art:      Idee");
    expect(t).toContain("Name:     nicht angegeben");
    expect(t).toContain("Familie:  1234abcd (Rolle MEMBER)");
    expect(t).toContain("Breite:   375 px");
    expect(t).toContain("<b>Mehr</b> Farben"); // plain text part only, never rendered as HTML
    expect(t).not.toContain("@");
  });
});

let f: Fixture;
const emailA = `a-${sfx}@example.test`;

async function mailsTo(address: string, timeoutMs = 8000) {
  const until = Date.now() + timeoutMs;
  for (;;) {
    const res = await fetch(`${mailpit}/search?query=${encodeURIComponent(`to:${address}`)}`);
    const body = (await res.json()) as { messages?: { ID: string }[] };
    if (body.messages?.length) {
      return Promise.all(body.messages.map(async (m) => (await (await fetch(`${mailpit}/message/${m.ID}`)).json()) as {
        Subject: string; Text: string; HTML: string; ReplyTo: { Address: string }[]; Attachments: { FileName: string; ContentType: string; Size: number }[];
      }));
    }
    if (Date.now() > until) return [];
    await new Promise((r) => setTimeout(r, 200));
  }
}

describe("submitFeedback (database and mail)", () => {
  beforeAll(async () => {
    f = await seed();
    await admin.user.update({ where: { id: f.userA }, data: { email: emailA } });
    const r = await fetch(`${mailpit}/info`);
    if (!r.ok) throw new Error("Mailpit is not running (npm run db:up)");
  });
  afterEach(() => {
    resetRateLimits();
    vi.restoreAllMocks();
  });
  afterAll(async () => {
    await fetch(`${mailpit}/search?query=${encodeURIComponent(`to:${TO}`)}`, { method: "DELETE" });
    await cleanup(f);
    await app.$disconnect();
    await admin.$disconnect();
  });

  const author = () => ({ userId: f.userA, email: emailA, familyId: f.familyA });

  it("stores without a recipient and reports not mailed", async () => {
    const r = await submitFeedback(author(), { kind: "OTHER", message: "Nur speichern", pagePath: "/", screenWidth: 375 }, UA, null, { mailTo: undefined });
    expect(r.mailed).toBe(false);
    const row = await admin.feedback.findUniqueOrThrow({ where: { id: r.id } });
    expect(row).toMatchObject({ familyId: f.familyA, userId: f.userA, kind: "OTHER", screenWidth: 375, mailedAt: null, device: "Safari auf iOS (Handy)" });
  });

  it("mails plain text with the screenshot attached and the author as reply-to", async () => {
    const r = await submitFeedback(
      author(),
      { kind: "BUG", message: "Knopf <script>x</script> geht nicht", authorName: "  Udo\r\nBcc: x ", pagePath: "/aufgaben?x=1", screenWidth: 390 },
      UA, PNG, { mailTo: TO, appVersion: "9.9.9" },
    );
    expect(r.mailed).toBe(true);
    const [m] = await mailsTo(TO);
    expect(m).toBeDefined();
    expect(m!.Subject).toBe("[Plan4JU Feedback] Fehler: Knopf <script>x</script> geht nicht");
    expect(m!.HTML).toBe("");
    expect(m!.Text).toMatch(/Seite: +\/aufgaben\r?\n/);
    expect(m!.Text).toContain("Version:  9.9.9");
    expect(m!.Text).toMatch(/Name: +Udo Bcc: x\r?\n/);
    expect(m!.ReplyTo[0]!.Address).toBe(emailA);
    expect(m!.Attachments).toHaveLength(1);
    expect(m!.Attachments[0]).toMatchObject({ ContentType: "image/png", Size: PNG.length });
    const row = await admin.feedback.findUniqueOrThrow({ where: { id: r.id } });
    expect(row.mailedAt).not.toBeNull();
    // Delivered: the screenshot went out as the attachment and is not kept in the database.
    expect(row.imageType).toBeNull();
    expect(row.image).toBeNull();
  });

  it("keeps the feedback when delivery fails and logs no content", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const send = vi.fn().mockRejectedValue(new Error(`SMTP down for ${TO} geheimer Text`));
    const r = await submitFeedback(author(), { kind: "IDEA", message: "geheimer Text", pagePath: "/", screenWidth: null }, UA, null, { mailTo: TO, send });
    expect(r.mailed).toBe(false);
    expect(send).toHaveBeenCalledOnce();
    const logged = JSON.stringify(log.mock.calls);
    expect(logged).not.toContain("geheimer Text");
    expect(logged).not.toContain(TO);
    expect((await admin.feedback.findUniqueOrThrow({ where: { id: r.id } })).mailedAt).toBeNull();
  });

  it("rejects images that are not PNG or JPEG, and stores nothing", async () => {
    const before = await admin.feedback.count({ where: { familyId: f.familyA } });
    await expect(
      submitFeedback(author(), { kind: "BUG", message: "x", pagePath: "/", screenWidth: null }, UA, new TextEncoder().encode("<svg/>"), { mailTo: undefined }),
    ).rejects.toBeInstanceOf(InvalidImageError);
    await expect(
      submitFeedback(author(), { kind: "BUG", message: "x", pagePath: "/", screenWidth: null }, UA, new Uint8Array(5 * 1024 * 1024 + 1), { mailTo: undefined }),
    ).rejects.toBeInstanceOf(InvalidImageError);
    expect(await admin.feedback.count({ where: { familyId: f.familyA } })).toBe(before);
  });

  it("rejects empty and over-long text", async () => {
    await expect(submitFeedback(author(), { kind: "BUG", message: "   ", pagePath: "/", screenWidth: null }, UA, null, { mailTo: undefined })).rejects.toThrow();
    await expect(submitFeedback(author(), { kind: "BUG", message: "x".repeat(5001), pagePath: "/", screenWidth: null }, UA, null, { mailTo: undefined })).rejects.toThrow();
  });

  it("allows 10 messages per account and hour, then refuses", async () => {
    for (let i = 0; i < 10; i++) {
      await submitFeedback(author(), { kind: "OTHER", message: `n${i}`, pagePath: "/", screenWidth: null }, UA, null, { mailTo: undefined });
    }
    await expect(
      submitFeedback(author(), { kind: "OTHER", message: "n11", pagePath: "/", screenWidth: null }, UA, null, { mailTo: undefined }),
    ).rejects.toBeInstanceOf(RateLimitError);
    // another account is not affected
    await submitFeedback({ userId: f.userB, email: "b@example.test", familyId: f.familyB }, { kind: "OTHER", message: "b", pagePath: "/", screenWidth: null }, UA, null, { mailTo: undefined });
  });

  it("RLS: a family sees only its own feedback, and nobody can write in another user's name", async () => {
    const seenByB = await withFamily(f.userB, f.familyB, ({ tx }) => tx.feedback.findMany());
    expect(seenByB.length).toBeGreaterThan(0);
    expect(seenByB.every((r) => r.familyId === f.familyB)).toBe(true);
    expect(await app.feedback.findMany()).toHaveLength(0);
    await expect(
      withFamily(f.userBoth, f.familyA, ({ tx }) => tx.feedback.create({
        data: { familyId: f.familyA, userId: f.userA, kind: "BUG", message: "fake", pagePath: "/", appVersion: "x", device: "x" },
      })),
    ).rejects.toThrow();
    await expect(
      withFamily(f.userBoth, f.familyA, ({ tx }) => tx.feedback.create({
        data: { familyId: f.familyB, userId: f.userBoth, kind: "BUG", message: "fake", pagePath: "/", appVersion: "x", device: "x" },
      })),
    ).rejects.toThrow();
  });
});
