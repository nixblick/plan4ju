import type { FamilyRole, PrismaClient } from "@prisma/client";
import { z } from "zod";
import {
  FEEDBACK_LIMIT, MAX_IMAGE_BYTES, MAX_MESSAGE, MAX_NAME, deviceSummary, feedbackSubject, feedbackText, sanitizePath, sniffImage,
} from "../../lib/feedback";
import { prisma } from "../db";
import { ForbiddenError } from "../errors";
import { sendMail, type Mail } from "../mail";
import { rateLimit } from "../ratelimit";
import { withFamily } from "../tenant";

export class InvalidImageError extends Error {
  constructor(message = "Invalid image") {
    super(message);
    this.name = "InvalidImageError";
  }
}

export const feedbackInput = z.object({
  kind: z.enum(["BUG", "IDEA", "OTHER"]),
  message: z.string().trim().min(1).max(MAX_MESSAGE),
  authorName: z.string().trim().max(MAX_NAME).optional().transform((v) => (v ? v : null)),
  pagePath: z.string().max(2000),
  screenWidth: z.coerce.number().int().min(1).max(20000).nullable(),
});
export type FeedbackInput = z.input<typeof feedbackInput>;

export interface FeedbackAuthor {
  userId: string;
  email: string;
  familyId: string;
}

export interface FeedbackDeps {
  send?: (mail: Mail) => Promise<void>;
  mailTo?: string | undefined;
  appVersion?: string;
  now?: Date;
}

export function appVersion(): string {
  return process.env.NEXT_PUBLIC_APP_VERSION || process.env.npm_package_version || "unbekannt";
}

/**
 * Stores the feedback in the active family (RLS) and then mails it to FEEDBACK_MAIL_TO.
 * Storing always comes first; a missing recipient or a failed delivery only leaves
 * mailedAt empty. Logs never contain the message, the image or addresses.
 */
export async function submitFeedback(
  author: FeedbackAuthor,
  raw: FeedbackInput,
  userAgent: string,
  image: Uint8Array | null,
  deps: FeedbackDeps = {},
): Promise<{ id: string; mailed: boolean }> {
  rateLimit(`feedback:user:${author.userId}`, FEEDBACK_LIMIT.max, FEEDBACK_LIMIT.windowMs);
  const input = feedbackInput.parse(raw);
  let imageType: "image/png" | "image/jpeg" | null = null;
  if (image && image.length > 0) {
    if (image.length > MAX_IMAGE_BYTES) throw new InvalidImageError("Image too large");
    imageType = sniffImage(image);
    if (!imageType) throw new InvalidImageError("Not a PNG or JPEG");
  }
  const now = deps.now ?? new Date();
  const version = deps.appVersion ?? appVersion();
  const pagePath = sanitizePath(input.pagePath);
  const device = deviceSummary(userAgent);

  const to = "mailTo" in deps ? deps.mailTo : process.env.FEEDBACK_MAIL_TO;
  const { id, role } = await withFamily(author.userId, author.familyId, async ({ tx, role }) => {
    const row = await tx.feedback.create({
      data: {
        familyId: author.familyId, userId: author.userId, kind: input.kind, message: input.message, authorName: input.authorName, pagePath,
        appVersion: version, device, screenWidth: input.screenWidth, createdAt: now,
        imageType, image: imageType && image ? Buffer.from(image) : null,
        // Hold the job off while the first delivery is in flight, so it cannot send the same mail twice.
        mailNextAt: to ? new Date(now.getTime() + MAIL_BACKOFF_MINUTES[0] * 60_000) : null,
      },
      select: { id: true },
    });
    return { id: row.id, role: role as FamilyRole };
  });

  if (!to) return { id, mailed: false };
  const mailed = await deliver(id, to, author.email, { ...input, pagePath, appVersion: version, device, familyId: author.familyId, role, createdAt: now, imageType, image: image && imageType ? Buffer.from(image) : null }, deps.send);
  await withFamily(author.userId, author.familyId, ({ tx }) =>
    tx.feedback.update({ where: { id }, data: attemptResult(0, mailed, new Date()), select: { id: true } }));
  return { id, mailed };
}

/** At most this many delivery attempts per feedback; after that it is marked as failed. */
export const MAX_MAIL_ATTEMPTS = 5;
/** Wait before attempt n+1 (index n-1): 5 min, 30 min, 2 h, 12 h. */
export const MAIL_BACKOFF_MINUTES = [5, 30, 120, 720] as const;

/** Columns after one more attempt (previous = attempts before it). */
export function attemptResult(previous: number, mailed: boolean, now: Date) {
  const attempts = previous + 1;
  if (mailed) return { mailAttempts: attempts, mailedAt: now, mailNextAt: null };
  if (attempts >= MAX_MAIL_ATTEMPTS) return { mailAttempts: attempts, mailNextAt: null, mailFailedAt: now };
  return { mailAttempts: attempts, mailNextAt: new Date(now.getTime() + MAIL_BACKOFF_MINUTES[attempts - 1]! * 60_000) };
}

interface MailFields {
  kind: "BUG" | "IDEA" | "OTHER";
  message: string;
  authorName: string | null;
  pagePath: string;
  appVersion: string;
  device: string;
  screenWidth: number | null;
  familyId: string;
  role: string;
  createdAt: Date;
  imageType: string | null;
  image: Buffer | null;
}

async function deliver(id: string, to: string, replyTo: string | null, f: MailFields, send?: (mail: Mail) => Promise<void>): Promise<boolean> {
  const imageType = f.imageType === "image/png" || f.imageType === "image/jpeg" ? f.imageType : null;
  try {
    await (send ?? sendMail)({
      to,
      ...(replyTo ? { replyTo } : {}),
      subject: feedbackSubject(f),
      text: feedbackText({ ...f, hasImage: !!(imageType && f.image) }),
      attachments: imageType && f.image
        ? [{ filename: `screenshot-${f.createdAt.toISOString().slice(0, 10)}.${imageType === "image/png" ? "png" : "jpg"}`, content: f.image, contentType: imageType }]
        : undefined,
    });
    return true;
  } catch (e) {
    console.error("feedback mail failed", id.slice(-6), e instanceof Error ? e.name : "error");
    return false;
  }
}

/** Feedback rows one job run retries, at most. */
export const RETRY_BATCH = 50;

export interface FeedbackRetryResult { due: number; mailed: number; error: number; failed: number }

/**
 * Retries feedback whose mail did not go out (job POST /api/jobs/kalender). The contextless function only
 * lists due rows; each retry reads and updates the row under RLS as a current member of the family.
 * Without FEEDBACK_MAIL_TO nothing is attempted. Counts only, never content or addresses.
 */
export async function retryFeedbackMails(deps: FeedbackDeps & { client?: PrismaClient } = {}): Promise<FeedbackRetryResult> {
  const result: FeedbackRetryResult = { due: 0, mailed: 0, error: 0, failed: 0 };
  const to = "mailTo" in deps ? deps.mailTo : process.env.FEEDBACK_MAIL_TO;
  if (!to) return result;
  const now = deps.now ?? new Date();
  const client = deps.client ?? prisma;
  const rows = await client.$queryRaw<{ feedback_id: string; family_id: string; user_id: string; reply_to: string | null }[]>`
    SELECT * FROM app_feedback_retry_due((${now.toISOString()}::timestamptz AT TIME ZONE 'UTC'), ${RETRY_BATCH}::int)`;
  result.due = rows.length;
  for (const r of rows) {
    const row = await withFamily(r.user_id, r.family_id, async ({ tx }) => {
      const f = await tx.feedback.findFirst({ where: { id: r.feedback_id, mailedAt: null, mailFailedAt: null } });
      if (!f) return null;
      const m = await tx.familyMembership.findUnique({ where: { familyId_userId: { familyId: r.family_id, userId: f.userId } }, select: { role: true } });
      return { ...f, role: m?.role ?? "ausgetreten" };
    }, client);
    if (!row) continue;
    const mailed = await deliver(row.id, to, r.reply_to, { ...row, image: row.image ? Buffer.from(row.image) : null }, deps.send);
    const data = attemptResult(row.mailAttempts, mailed, deps.now ?? new Date());
    await withFamily(r.user_id, r.family_id, ({ tx }) =>
      tx.feedback.updateMany({ where: { id: row.id, mailedAt: null, mailAttempts: row.mailAttempts }, data }), client);
    if (mailed) result.mailed++;
    else if ("mailFailedAt" in data) result.failed++;
    else result.error++;
  }
  return result;
}

export interface UndeliveredFeedback { id: string; kind: string; message: string; createdAt: Date; mailAttempts: number; mailNextAt: Date | null; mailFailedAt: Date | null }

/** "Meldungen, die nicht zugestellt wurden": owners of the active family only. */
export async function listUndeliveredFeedback(userId: string, familyId: string, client?: PrismaClient): Promise<UndeliveredFeedback[]> {
  return withFamily(userId, familyId, async ({ tx, role }) => {
    if (role !== "OWNER") throw new ForbiddenError("Owners only");
    return tx.feedback.findMany({
      where: { familyId, mailedAt: null },
      select: { id: true, kind: true, message: true, createdAt: true, mailAttempts: true, mailNextAt: true, mailFailedAt: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }, client);
}
