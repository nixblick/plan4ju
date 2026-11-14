import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { admin, app, cleanup, seed, type Fixture } from "./helpers";
import { ForbiddenError } from "../src/server/errors";
import { resetRateLimits } from "../src/server/ratelimit";
import {
  MAIL_BACKOFF_MINUTES, MAX_MAIL_ATTEMPTS, attemptResult, listUndeliveredFeedback, retryFeedbackMails, submitFeedback,
} from "../src/server/services/feedback";

const TO = "retry@example.test";
const UA = "Mozilla/5.0 (X11; Linux x86_64) Chrome/130.0";
let f: Fixture;
const min = (n: number) => n * 60_000;

describe("attemptResult", () => {
  const now = new Date("2026-11-14T10:00:00Z");
  it("schedules the next attempt with growing backoff", () => {
    expect(attemptResult(0, false, now)).toEqual({ mailAttempts: 1, mailNextAt: new Date(now.getTime() + min(5)) });
    expect(attemptResult(3, false, now).mailNextAt).toEqual(new Date(now.getTime() + min(MAIL_BACKOFF_MINUTES[3])));
  });
  it("marks failure after the fifth attempt and success at once", () => {
    expect(attemptResult(MAX_MAIL_ATTEMPTS - 1, false, now)).toEqual({ mailAttempts: 5, mailNextAt: null, mailFailedAt: now });
    expect(attemptResult(2, true, now)).toEqual({ mailAttempts: 3, mailedAt: now, mailNextAt: null });
  });
});

describe("retryFeedbackMails", () => {
  beforeAll(async () => { f = await seed(); });
  afterEach(() => { resetRateLimits(); vi.restoreAllMocks(); });
  afterAll(async () => { await cleanup(f); await app.$disconnect(); await admin.$disconnect(); });

  const failing = () => vi.fn().mockRejectedValue(new Error("SMTP down"));
  const submitFailed = async (msg: string) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await submitFeedback({ userId: f.userA, email: "a@example.test", familyId: f.familyA },
      { kind: "BUG", message: msg, pagePath: "/", screenWidth: 375 }, UA, null, { mailTo: TO, send: failing() });
    return r.id;
  };
  const row = (id: string) => admin.feedback.findUniqueOrThrow({ where: { id } });

  it("a failed first delivery counts as attempt 1 with backoff; nothing is sent before it is due", async () => {
    const id = await submitFailed("erst später");
    const r = await row(id);
    expect(r.mailAttempts).toBe(1);
    expect(r.mailNextAt!.getTime()).toBeGreaterThan(Date.now() + min(4));
    const send = vi.fn().mockResolvedValue(undefined);
    await retryFeedbackMails({ mailTo: TO, send });
    expect(send.mock.calls.some(([m]) => m.text.includes("erst später"))).toBe(false);
  });

  it("retries a due row, sends the stored content with reply-to, and sets mailedAt", async () => {
    const id = await submitFailed("zweiter Anlauf");
    const send = vi.fn().mockResolvedValue(undefined);
    const res = await retryFeedbackMails({ mailTo: TO, send, now: new Date(Date.now() + min(6)) });
    expect(res.mailed).toBeGreaterThanOrEqual(1);
    const mine = send.mock.calls.map(([m]) => m).find((m) => m.text.includes("zweiter Anlauf"));
    const { email } = await admin.user.findUniqueOrThrow({ where: { id: f.userA } });
    expect(mine).toMatchObject({ to: TO, replyTo: email });
    expect(mine.text).toContain("Rolle OWNER");
    const r = await row(id);
    expect(r.mailedAt).not.toBeNull();
    expect(r.mailAttempts).toBe(2);
  });

  it("gives up after 5 attempts and marks the row failed", async () => {
    const id = await submitFailed("kommt nie an");
    let t = Date.now();
    for (let i = 0; i < 6; i++) {
      t += min(13 * 60);
      await retryFeedbackMails({ mailTo: TO, send: failing(), now: new Date(t) });
    }
    const r = await row(id);
    expect(r.mailAttempts).toBe(5);
    expect(r.mailFailedAt).not.toBeNull();
    expect(r.mailedAt).toBeNull();
    const send = vi.fn().mockResolvedValue(undefined);
    await retryFeedbackMails({ mailTo: TO, send, now: new Date(t + min(10_000)) });
    expect(send.mock.calls.some(([m]) => m.text.includes("kommt nie an"))).toBe(false);
  });

  it("does nothing without a recipient", async () => {
    const send = vi.fn();
    expect(await retryFeedbackMails({ mailTo: undefined, send })).toEqual({ due: 0, mailed: 0, error: 0, failed: 0 });
    expect(send).not.toHaveBeenCalled();
  });

  it("owners see undelivered feedback of their own family only; members are refused", async () => {
    const id = await submitFailed("für die Liste");
    const listA = await listUndeliveredFeedback(f.userA, f.familyA);
    expect(listA.some((r) => r.id === id)).toBe(true);
    expect(listA.every((r) => r.mailAttempts >= 0)).toBe(true);
    const listB = await listUndeliveredFeedback(f.userB, f.familyB);
    expect(listB.some((r) => r.id === id)).toBe(false);
    await expect(listUndeliveredFeedback(f.userBoth, f.familyA)).rejects.toBeInstanceOf(ForbiddenError);
  });
});
