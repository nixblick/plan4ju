"use server";

import { TOPICS, VISIBILITIES, type Topic, type Visibility } from "@/lib/achtsamkeit";
import { deleteCheckin, deleteEntry, saveCheckin, saveEntry, savePref } from "@/server/services/mindfulness";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireFamily } from "@/server/session";
import { calendarErrorCode, text } from "./action-helpers";

// Error and success codes only; never the rating or the note in the address bar or in logs.

const id = (form: FormData, k: string) => {
  const v = text(form, k);
  return /^[a-z0-9-]{1,60}$/.test(v) ? v : "";
};

async function run(form: FormData, ok: string, job: (a: Awaited<ReturnType<typeof requireFamily>>) => Promise<void>) {
  const active = await requireFamily();
  let failure: string | null = null;
  try {
    await job(active);
  } catch (e) {
    failure = e instanceof Error && e.name === "ZodError" ? "eingabe-achtsamkeit" : calendarErrorCode(e);
  }
  revalidatePath("/achtsamkeit");
  // Only the shown person (an id) goes back into the address; never rating, note or topic.
  const person = id(form, "person");
  const q = new URLSearchParams(person ? { person } : {});
  q.set(failure ? "fehler" : "ok", failure ?? ok);
  redirect(`/achtsamkeit?${q}`);
}

export async function saveEntryAction(form: FormData) {
  const topic = text(form, "topic");
  const visibility = text(form, "visibility");
  await run(form, "achtsamkeit-gespeichert", async ({ user, familyId }) => {
    await saveEntry(user.id, familyId, {
      profileId: id(form, "profileId"),
      topic: ((TOPICS as readonly string[]).includes(topic) ? topic : "MOOD") as Topic,
      date: text(form, "date"),
      rating: Number(text(form, "rating")),
      note: text(form, "note"),
      visibility: ((VISIBILITIES as readonly string[]).includes(visibility) ? visibility : "PRIVATE") as Visibility,
      viewerIds: form.getAll("viewer").map(String).filter((v) => /^[A-Za-z0-9_-]{1,100}$/.test(v)),
    });
  });
}

export async function deleteEntryAction(form: FormData) {
  await run(form, "achtsamkeit-geloescht", async ({ user, familyId }) => {
    await deleteEntry(user.id, familyId, id(form, "entryId"));
  });
}

/** One submitted questionnaire: every ticked topic with a rating becomes part of one entry. */
export async function saveCheckinAction(form: FormData) {
  await run(form, "achtsamkeit-gespeichert", async ({ user, familyId }) => {
    const ratings = TOPICS.flatMap((t) => {
      if (form.get(`use-${t}`) !== "on") return [];
      const r = Number(text(form, `rating-${t}`));
      return r >= 1 && r <= 5 ? [{ topic: t, rating: r }] : [];
    });
    await saveCheckin(user.id, familyId, {
      profileId: id(form, "profileId"),
      date: text(form, "date"),
      note: text(form, "note"),
      ratings,
    });
  });
}

export async function savePrefAction(form: FormData) {
  const visibility = text(form, "visibility");
  await run(form, "achtsamkeit-sichtbarkeit", async ({ user, familyId }) => {
    await savePref(user.id, familyId, {
      visibility: ((VISIBILITIES as readonly string[]).includes(visibility) ? visibility : "PRIVATE") as Visibility,
      viewerIds: form.getAll("viewer").map(String).filter((v) => /^[A-Za-z0-9_-]{1,100}$/.test(v)),
    });
  });
}

export async function deleteCheckinAction(form: FormData) {
  await run(form, "achtsamkeit-geloescht", async ({ user, familyId }) => {
    await deleteCheckin(user.id, familyId, text(form, "checkinId").slice(0, 100));
  });
}
