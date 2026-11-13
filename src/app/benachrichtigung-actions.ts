"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { baseUrl } from "@/server/env";
import { NotFoundError } from "@/server/errors";
import { requireFamily } from "@/server/session";
import { createFeed, markAllRead, openNotification, PREF_KEYS, revokeFeed, savePrefs, type Prefs } from "@/server/services/notifications";
import { localPath, runAction, text } from "./action-helpers";

export async function openNotificationAction(form: FormData) {
  const { user, familyId } = await requireFamily();
  let target = "/benachrichtigungen";
  try {
    target = localPath(await openNotification(user.id, familyId, text(form, "id")), target);
  } catch (e) {
    if (!(e instanceof NotFoundError)) throw e;
  }
  revalidatePath("/", "layout");
  redirect(target);
}

export async function markAllReadAction() {
  await runAction("/benachrichtigungen", "benachrichtigungen-gelesen", async ({ user, familyId }) => {
    await markAllRead(user.id, familyId);
  });
}

export async function savePrefsAction(form: FormData) {
  await runAction("/benachrichtigungen/einstellungen", "benachrichtigungen-gespeichert", async ({ user, familyId }) => {
    const prefs = Object.fromEntries(PREF_KEYS.map((k) => [k, form.get(k) === "on"])) as Prefs;
    await savePrefs(user.id, familyId, prefs);
  });
}

/** Returns the new feed address once to the client; it is never stored or put into a URL of this app. */
export async function createFeedAction(_prev: { url: string } | null): Promise<{ url: string } | null> {
  const { user, familyId } = await requireFamily();
  const token = await createFeed(user.id, familyId);
  revalidatePath("/benachrichtigungen/einstellungen");
  return { url: `${baseUrl()}/api/kalender/feed/${token}.ics` };
}

export async function revokeFeedAction() {
  await runAction("/benachrichtigungen/einstellungen", "kalender-link-widerrufen", async ({ user, familyId }) => {
    await revokeFeed(user.id, familyId);
  });
}
