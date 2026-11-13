"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ConflictError, ForbiddenError, NotFoundError, RateLimitError } from "@/server/errors";
import { createBirthday, deleteBirthday, updateBirthday } from "@/server/services/birthdays";
import {
  createRoutine,
  setOccurrenceAssignees,
  setOccurrenceStatus,
  setRoutineStatus,
  updateRoutine,
  type RoutineInput,
} from "@/server/services/routines";
import { createTask, deleteTask, setTaskArchived, setTaskDone, updateTask, type TaskInput } from "@/server/services/tasks";
import { requireFamily } from "@/server/session";
import { toPriority } from "@/lib/priority";

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
  const sep = path.includes("?") ? "&" : "?";
  redirect(failure ? `${path}${sep}fehler=${failure}` : `${path}${sep}ok=${ok}`);
}

// ---- Tasks ----------------------------------------------------------------------------

function taskFromForm(form: FormData): TaskInput {
  const due = text(form, "dueDate").trim();
  const time = text(form, "dueTime").trim();
  const status = text(form, "status");
  return {
    title: text(form, "title"),
    description: text(form, "description") || null,
    dueDate: due === "" ? null : due,
    dueTime: due !== "" && time !== "" ? time : null,
    priority: toPriority(text(form, "priority")),
    showOnDashboard: form.get("showOnDashboard") != null,
    ...(status ? { status: status as TaskInput["status"] } : {}),
    assigneeIds: form.getAll("assigneeIds").map(String),
  };
}

export async function createTaskAction(form: FormData) {
  await run("/aufgaben", "aufgabe", async (a) => {
    await createTask(a.user.id, a.familyId, taskFromForm(form));
  });
}

export async function updateTaskAction(form: FormData) {
  const id = text(form, "taskId");
  await run(`/aufgaben/${encodeURIComponent(id)}`, "gespeichert", async (a) => {
    await updateTask(a.user.id, a.familyId, id, taskFromForm(form));
  });
}

export async function archiveTaskAction(form: FormData) {
  const archived = text(form, "archived") === "1";
  await run("/aufgaben", archived ? "aufgabe-archiviert" : "gespeichert", (a) =>
    setTaskArchived(a.user.id, a.familyId, text(form, "taskId"), archived),
  );
}

export async function toggleTaskAction(form: FormData) {
  await run("/aufgaben", "gespeichert", (a) =>
    setTaskDone(a.user.id, a.familyId, text(form, "taskId"), text(form, "done") === "1"),
  );
}

export async function deleteTaskAction(form: FormData) {
  await run("/aufgaben", "aufgabe-weg", (a) => deleteTask(a.user.id, a.familyId, text(form, "taskId")));
}

// ---- Routines -------------------------------------------------------------------------

function routineFromForm(form: FormData): RoutineInput {
  const monthDay = text(form, "monthDay").trim();
  const end = text(form, "endDate").trim();
  const time = text(form, "timeOfDay").trim();
  return {
    title: text(form, "title"),
    description: text(form, "description") || null,
    freq: text(form, "freq") as RoutineInput["freq"],
    interval: text(form, "interval") || 1,
    weekdays: form.getAll("weekdays").map(Number),
    monthDay: monthDay === "" ? null : Number(monthDay),
    startDate: text(form, "startDate"),
    endDate: end === "" ? null : end,
    timeOfDay: time === "" ? null : time,
    assignMode: text(form, "assignMode") as RoutineInput["assignMode"],
    assigneeIds: form.getAll("assigneeIds").map(String),
  };
}

export async function createRoutineAction(form: FormData) {
  await run("/routinen?tab=alle", "routine", async (a) => {
    await createRoutine(a.user.id, a.familyId, routineFromForm(form));
  });
}

export async function updateRoutineAction(form: FormData) {
  const id = text(form, "routineId");
  await run(`/routinen/${encodeURIComponent(id)}`, "gespeichert", async (a) => {
    await updateRoutine(a.user.id, a.familyId, id, routineFromForm(form));
  });
}

export async function routineStatusAction(form: FormData) {
  const status = text(form, "status") as "ACTIVE" | "PAUSED" | "ARCHIVED";
  const ok = status === "ARCHIVED" ? "routine-archiviert" : status === "PAUSED" ? "routine-pausiert" : "routine-aktiv";
  await run("/routinen?tab=alle", ok, (a) => setRoutineStatus(a.user.id, a.familyId, text(form, "routineId"), status));
}

/** Done / skipped / open for one occurrence; `back` is a local path on this site. */
export async function occurrenceStatusAction(form: FormData) {
  const status = text(form, "status") as "OPEN" | "DONE" | "SKIPPED";
  const back = text(form, "back");
  await run(back.startsWith("/") && !back.startsWith("//") ? back : "/routinen", "gespeichert", (a) =>
    setOccurrenceStatus(a.user.id, a.familyId, text(form, "occurrenceId"), status),
  );
}

export async function occurrenceAssigneesAction(form: FormData) {
  const back = text(form, "back");
  await run(back.startsWith("/") && !back.startsWith("//") ? back : "/routinen", "gespeichert", (a) =>
    setOccurrenceAssignees(a.user.id, a.familyId, text(form, "occurrenceId"), form.getAll("assigneeIds").map(String)),
  );
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
