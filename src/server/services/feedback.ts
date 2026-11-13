import type { FamilyRole } from "@prisma/client";
import { z } from "zod";
import {
  FEEDBACK_LIMIT, MAX_IMAGE_BYTES, MAX_MESSAGE, MAX_NAME, deviceSummary, feedbackSubject, feedbackText, sanitizePath, sniffImage,
} from "../../lib/feedback";
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

  const { id, role } = await withFamily(author.userId, author.familyId, async ({ tx, role }) => {
    const row = await tx.feedback.create({
      data: {
        familyId: author.familyId, userId: author.userId, kind: input.kind, message: input.message, authorName: input.authorName, pagePath,
        appVersion: version, device, screenWidth: input.screenWidth, createdAt: now,
        imageType, image: imageType && image ? Buffer.from(image) : null,
      },
      select: { id: true },
    });
    return { id: row.id, role: role as FamilyRole };
  });

  const to = "mailTo" in deps ? deps.mailTo : process.env.FEEDBACK_MAIL_TO;
  if (!to) return { id, mailed: false };
  try {
    await (deps.send ?? sendMail)({
      to,
      replyTo: author.email,
      subject: feedbackSubject(input),
      text: feedbackText({
        ...input, pagePath, appVersion: version, device, familyId: author.familyId, role, createdAt: now,
        hasImage: !!imageType,
      }),
      attachments: imageType && image
        ? [{ filename: `screenshot-${now.toISOString().slice(0, 10)}.${imageType === "image/png" ? "png" : "jpg"}`, content: Buffer.from(image), contentType: imageType }]
        : undefined,
    });
    await withFamily(author.userId, author.familyId, ({ tx }) =>
      tx.feedback.update({ where: { id }, data: { mailedAt: new Date() }, select: { id: true } }));
    return { id, mailed: true };
  } catch (e) {
    console.error("feedback mail failed", e instanceof Error ? e.name : "error");
    return { id, mailed: false };
  }
}
