"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ConflictError, ForbiddenError, NotFoundError, RateLimitError } from "@/server/errors";
import { createBirthday, deleteBirthday, updateBirthday } from "@/server/services/birthdays";
import { createTask, deleteTask, setTaskDone } from "@/server/services/tasks";
import { requireFamily } from "@/server/session";

const text = (f: FormData, k: string) => String(f.get(k) ?? "");
const num = (f: FormData, k: string): number | null => {
  const v = text(f, k).trim();
  return v === "" ? null : Number(v);
};

function codeFor(e: unknown): string {
  if (e instanceof RateLimitError) return "zu-viele";
  if (e instanceof ForbiddenError) return "verboten";
  if (e instanceof ConflictError) return "konflikt";
  if (e instanceof NotFoundError) return "nicht-gefunden";
  if (e instanceof Error && e.name === "ZodError") return "eingabe-plan";
  throw e;
}

async function run(path: string, ok: string, job: (a: Awaited<ReturnType<typeof requireFamily>>) => Promise<void>) {
  const active = await requireFamily();
  let failure: string | null = null;
  try {
    await job(active);
  } catch (e) {
    failure = codeFor(e);
  }
  revalidatePath("/", "layout");
  redirect(failure ? `${path}?fehler=${failure}` : `${path}?ok=${ok}`);
}

// ---- Tasks ----------------------------------------------------------------------------

export async function createTaskAction(form: FormData) {
  await run("/aufgaben", "aufgabe", async (a) => {
    const due = text(form, "dueDate").trim();
    await createTask(a.user.id, a.familyId, {
      title: text(form, "title"),
      dueDate: due === "" ? null : due,
      assigneeIds: form.getAll("assigneeIds").map(String),
    });
  });
}

export async function toggleTaskAction(form: FormData) {
  await run("/aufgaben", "gespeichert", (a) =>
    setTaskDone(a.user.id, a.familyId, text(form, "taskId"), text(form, "done") === "1"),
  );
}

export async function deleteTaskAction(form: FormData) {
  await run("/aufgaben", "aufgabe-weg", (a) => deleteTask(a.user.id, a.familyId, text(form, "taskId")));
}

// ---- Birthdays ------------------------------------------------------------------------

function birthdayFromForm(form: FormData) {
  return {
    name: text(form, "name"),
    day: Number(text(form, "day")),
    month: Number(text(form, "month")),
    birthYear: num(form, "birthYear"),
    note: text(form, "note") || null,
  };
}

export async function createBirthdayAction(form: FormData) {
  await run("/geburtstage", "geburtstag", (a) => createBirthday(a.user.id, a.familyId, birthdayFromForm(form)).then(() => {}));
}

export async function updateBirthdayAction(form: FormData) {
  await run("/geburtstage", "gespeichert", (a) =>
    updateBirthday(a.user.id, a.familyId, text(form, "birthdayId"), birthdayFromForm(form)),
  );
}

export async function deleteBirthdayAction(form: FormData) {
  await run("/geburtstage", "geburtstag-weg", (a) => deleteBirthday(a.user.id, a.familyId, text(form, "birthdayId")));
}
