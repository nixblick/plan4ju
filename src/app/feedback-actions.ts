"use server";

import { headers } from "next/headers";
import { RateLimitError } from "@/server/errors";
import { InvalidImageError, submitFeedback } from "@/server/services/feedback";
import { requireFamily } from "@/server/session";
import { MAX_IMAGE_BYTES } from "@/lib/feedback";

export type FeedbackState = { status: "idle" | "ok" | "error"; message?: string; at?: number };

const text = (f: FormData, k: string) => String(f.get(k) ?? "");

/** Server action (same-origin check by Next.js like every other action), signed-in family members only. */
export async function feedbackAction(_prev: FeedbackState, form: FormData): Promise<FeedbackState> {
  const { user, familyId } = await requireFamily();
  const file = form.get("bild");
  let image: Uint8Array | null = null;
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_IMAGE_BYTES) return { status: "error", message: "Das Bild ist größer als 5 MB." };
    image = new Uint8Array(await file.arrayBuffer());
  }
  const width = text(form, "breite");
  try {
    await submitFeedback(
      { userId: user.id, email: user.email, familyId },
      {
        kind: text(form, "art") as "BUG",
        message: text(form, "text"),
        pagePath: text(form, "seite"),
        screenWidth: width ? Number(width) : null,
      },
      (await headers()).get("user-agent") ?? "",
      image,
    );
    return { status: "ok", at: Date.now() };
  } catch (e) {
    if (e instanceof RateLimitError) return { status: "error", message: "Zu viele Meldungen in kurzer Zeit. Bitte später noch einmal." };
    if (e instanceof InvalidImageError) return { status: "error", message: "Bitte nur PNG- oder JPEG-Bilder bis 5 MB." };
    if (e instanceof Error && e.name === "ZodError") return { status: "error", message: "Bitte Art wählen und einen Text (bis 5000 Zeichen) eingeben." };
    throw e;
  }
}
