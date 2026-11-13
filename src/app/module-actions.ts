"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isModuleKey } from "@/lib/modules";
import { NotFoundError } from "@/server/errors";
import { addFlyer, deleteFlyer, setModule, setWasteCalendar, updateFlyer } from "@/server/services/modules";
import { requireFamily } from "@/server/session";
import { calendarErrorCode, text } from "./action-helpers";

async function run(path: string, ok: string, job: (a: Awaited<ReturnType<typeof requireFamily>>) => Promise<unknown>) {
  const active = await requireFamily();
  let failure: string | null = null;
  try {
    await job(active);
  } catch (e) {
    failure = e instanceof Error && e.name === "ZodError" ? "eingabe-prospekt" : calendarErrorCode(e);
    if (failure === "kalender-limit") failure = "eingabe-prospekt";
  }
  revalidatePath("/", "layout");
  redirect(failure ? `${path}?fehler=${failure}` : `${path}?ok=${ok}`);
}

export async function setModuleAction(form: FormData) {
  const key = text(form, "module");
  const on = text(form, "on") === "1";
  await run("/familie/module", on ? "modul-an" : "modul-aus", async (a) => {
    if (!isModuleKey(key)) throw new NotFoundError("unknown module");
    await setModule(a.user.id, a.familyId, key, on);
  });
}

export async function addFlyerAction(form: FormData) {
  await run("/einkauf/prospekte", "prospekt", (a) => addFlyer(a.user.id, a.familyId, { name: text(form, "name"), url: text(form, "url") }));
}

export async function updateFlyerAction(form: FormData) {
  await run("/einkauf/prospekte", "prospekt", (a) =>
    updateFlyer(a.user.id, a.familyId, text(form, "id"), { name: text(form, "name"), url: text(form, "url"), active: text(form, "active") === "1" }),
  );
}

export async function deleteFlyerAction(form: FormData) {
  await run("/einkauf/prospekte", "prospekt-weg", (a) => deleteFlyer(a.user.id, a.familyId, text(form, "id")));
}

export async function setWasteCalendarAction(form: FormData) {
  await run("/kalender/abfall", "abfall-kalender", (a) => setWasteCalendar(a.user.id, a.familyId, text(form, "calendarId") || null));
}
