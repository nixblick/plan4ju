"use server";

import { MAX_FILE_BYTES, addSubscription, createEvent, deleteCalendar, deleteEvent, importIcsFile, reimportIcsFile, resetEventInstance, setEventInstance, syncCalendar, updateCalendar, updateEvent, type EventInput } from "@/server/services/calendar";
import { FetchError } from "@/server/safe-fetch";
import { localPath, runAction, text } from "./action-helpers";

function eventFromForm(form: FormData): EventInput {
  const opt = (k: string) => text(form, k).trim() || null;
  const freq = opt("freq");
  return {
    title: text(form, "title"),
    description: opt("description"),
    location: opt("location"),
    allDay: form.get("allDay") === "1",
    startDate: text(form, "startDate"),
    startTime: opt("startTime"),
    endDate: opt("endDate"),
    endTime: opt("endTime"),
    freq: freq as EventInput["freq"],
    interval: text(form, "interval") || 1,
    weekdays: form.getAll("weekdays").map(Number),
    monthDay: opt("monthDay") === null ? null : Number(text(form, "monthDay")),
    repeatUntil: opt("repeatUntil"),
    participantIds: form.getAll("participantIds").map(String),
  };
}

export async function createEventAction(form: FormData) {
  await runAction("/kalender", "termin", async (a) => {
    await createEvent(a.user.id, a.familyId, eventFromForm(form));
  });
}

export async function updateEventAction(form: FormData) {
  const id = text(form, "eventId");
  await runAction(`/kalender/termin/${encodeURIComponent(id)}`, "gespeichert", async (a) => {
    await updateEvent(a.user.id, a.familyId, id, eventFromForm(form));
  });
}

export async function deleteEventAction(form: FormData) {
  await runAction("/kalender", "termin-weg", (a) => deleteEvent(a.user.id, a.familyId, text(form, "eventId")));
}

/** Moves, cancels or resets one instance of a repeated event (`date` is its rule day). */
export async function eventInstanceAction(form: FormData) {
  const id = text(form, "eventId");
  const date = text(form, "date");
  const mode = text(form, "mode");
  const opt = (k: string) => text(form, k).trim() || null;
  await runAction(`/kalender/termin/${encodeURIComponent(id)}/${encodeURIComponent(date)}`, mode === "absagen" ? "abgesagt" : mode === "zuruecksetzen" ? "zurueckgesetzt" : "verschoben", async (a) => {
    if (mode === "zuruecksetzen") return resetEventInstance(a.user.id, a.familyId, id, date);
    await setEventInstance(a.user.id, a.familyId, id, mode === "absagen"
      ? { date, cancelled: true }
      : { date, startDate: text(form, "startDate"), startTime: opt("startTime"), endDate: opt("endDate"), endTime: opt("endTime") });
  });
}

/** Reads an uploaded file as text; refuses oversized files before reading them into the service. */
async function fileText(form: FormData): Promise<string> {
  const f = form.get("datei");
  if (!(f instanceof File) || f.size === 0) throw new FetchError("inhalt");
  if (f.size > MAX_FILE_BYTES) throw new FetchError("gross");
  return f.text();
}

export async function importFileAction(form: FormData) {
  await runAction("/kalender/quellen", "kalender-datei", async (a) => {
    const name = text(form, "name").trim() || (form.get("datei") instanceof File ? (form.get("datei") as File).name.replace(/\.[^.]*$/, "") : "") || "Importierter Kalender";
    await importIcsFile(a.user.id, a.familyId, { name, colorIndex: Number(text(form, "colorIndex") || 0), text: await fileText(form) });
  });
}

export async function reimportFileAction(form: FormData) {
  await runAction("/kalender/quellen", "kalender-aktualisiert", async (a) => {
    await reimportIcsFile(a.user.id, a.familyId, text(form, "calendarId"), await fileText(form));
  });
}

export async function addSubscriptionAction(form: FormData) {
  await runAction("/kalender/quellen", "kalender-abo", async (a) => {
    await addSubscription(a.user.id, a.familyId, { name: text(form, "name"), colorIndex: Number(text(form, "colorIndex") || 0), url: text(form, "url") });
  });
}

export async function refreshCalendarAction(form: FormData) {
  await runAction("/kalender/quellen", "kalender-abgerufen", async (a) => {
    const r = await syncCalendar(a.user.id, a.familyId, text(form, "calendarId"), { manual: true });
    return r.status === "ok" ? "kalender-abgerufen" : r.status === "skipped" ? "kalender-zu-frueh" : "kalender-fehler";
  });
}

export async function updateCalendarAction(form: FormData) {
  await runAction("/kalender/quellen", "gespeichert", (a) =>
    updateCalendar(a.user.id, a.familyId, text(form, "calendarId"), {
      name: text(form, "name"),
      colorIndex: Number(text(form, "colorIndex") || 0),
    }),
  );
}

export async function toggleCalendarAction(form: FormData) {
  const enabled = text(form, "enabled") === "1";
  await runAction(localPath(text(form, "back"), "/kalender/quellen"), enabled ? "kalender-an" : "kalender-aus", (a) =>
    updateCalendar(a.user.id, a.familyId, text(form, "calendarId"), { enabled }),
  );
}

export async function deleteCalendarAction(form: FormData) {
  await runAction("/kalender/quellen", "kalender-weg", (a) => deleteCalendar(a.user.id, a.familyId, text(form, "calendarId")));
}
