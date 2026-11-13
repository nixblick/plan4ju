"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AiNotConfiguredError, AiProviderError, suggestRecipe, type IdeaDraft } from "@/server/ai/recipe-ideas";
import { ForbiddenError, RateLimitError } from "@/server/errors";
import {
  addMealSlot,
  copyMealWeek,
  createMeal,
  deleteMeal,
  deleteMealSlot,
  MealConflictError,
  moveMealSlot,
  renameMealSlot,
  updateMeal,
  type MealInput,
} from "@/server/services/meals";
import { requireFamily } from "@/server/session";
import { calendarErrorCode, text } from "./action-helpers";

const back = (form: FormData) => {
  const w = text(form, "week");
  return /^\d{4}-\d{2}-\d{2}$/.test(w) ? `/essen?woche=${w}` : "/essen";
};

async function run(path: string, ok: string, job: (a: Awaited<ReturnType<typeof requireFamily>>) => Promise<unknown>) {
  const active = await requireFamily();
  let failure: string | null = null;
  try {
    await job(active);
  } catch (e) {
    failure = e instanceof MealConflictError ? "essen-belegt" : calendarErrorCode(e);
  }
  revalidatePath("/", "layout");
  const sep = path.includes("?") ? "&" : "?";
  redirect(failure ? `${path}${sep}fehler=${failure}` : `${path}${sep}ok=${ok}`);
}

function mealFromForm(form: FormData): MealInput {
  return {
    date: text(form, "date"),
    slotId: text(form, "slotId"),
    recipeId: text(form, "recipeId") || null,
    text: text(form, "text") || null,
    cookIds: form.getAll("cookIds").map(String).filter(Boolean),
  };
}

export async function saveMealAction(form: FormData) {
  const id = text(form, "mealId");
  await run(back(form), "essen", (a) => (id ? updateMeal(a.user.id, a.familyId, id, mealFromForm(form)) : createMeal(a.user.id, a.familyId, mealFromForm(form))));
}

export async function deleteMealAction(form: FormData) {
  await run(back(form), "essen-weg", (a) => deleteMeal(a.user.id, a.familyId, text(form, "mealId")));
}

export async function copyWeekAction(form: FormData) {
  const from = text(form, "week");
  const target = /^\d{4}-\d{2}-\d{2}$/.test(from) ? new Date(Date.parse(`${from}T00:00:00Z`) + 7 * 86400000).toISOString().slice(0, 10) : "";
  await run(target ? `/essen?woche=${target}` : "/essen", "woche-kopiert", (a) => copyMealWeek(a.user.id, a.familyId, from));
}

export async function addSlotAction(form: FormData) {
  await run(back(form), "mahlzeit", (a) => addMealSlot(a.user.id, a.familyId, text(form, "name")));
}

export async function renameSlotAction(form: FormData) {
  await run(back(form), "gespeichert", (a) => renameMealSlot(a.user.id, a.familyId, text(form, "slotId"), text(form, "name")));
}

export async function moveSlotAction(form: FormData) {
  await run(back(form), "gespeichert", (a) => moveMealSlot(a.user.id, a.familyId, text(form, "slotId"), text(form, "dir") === "up" ? -1 : 1));
}

export async function deleteSlotAction(form: FormData) {
  await run(back(form), "mahlzeit-weg", (a) => deleteMealSlot(a.user.id, a.familyId, text(form, "slotId")));
}

export type IdeaState = { status: "idle" } | { status: "ok"; draft: IdeaDraft; n: number } | { status: "error"; message: string };

const numOrNull = (s: string) => (s.trim() && Number.isFinite(Number(s)) ? Number(s) : null);

/** Fixed German messages; never the provider's error text. */
export async function recipeIdeaAction(prev: IdeaState, form: FormData): Promise<IdeaState> {
  const { user, familyId } = await requireFamily();
  try {
    const draft = await suggestRecipe(user.id, familyId, {
      wishes: text(form, "wishes"),
      exclude: text(form, "exclude"),
      diet: text(form, "diet"),
      maxMinutes: numOrNull(text(form, "maxMinutes")),
      servings: numOrNull(text(form, "servings")),
    });
    return { status: "ok", draft, n: prev.status === "ok" ? prev.n + 1 : 1 };
  } catch (e) {
    if (e instanceof AiNotConfiguredError) return { status: "error", message: "Rezeptideen sind auf diesem Server nicht eingerichtet." };
    if (e instanceof RateLimitError) return { status: "error", message: "Zu viele Rezeptideen in kurzer Zeit. Bitte versuche es später wieder." };
    if (e instanceof ForbiddenError) return { status: "error", message: "Dafür fehlt dir die Berechtigung." };
    if (e instanceof AiProviderError) return { status: "error", message: "Der Dienst für Rezeptideen hat gerade keine brauchbare Antwort geliefert. Bitte versuche es noch einmal." };
    if (e instanceof Error && e.name === "ZodError") return { status: "error", message: "Bitte gib mindestens ein Stichwort ein (höchstens 300 Zeichen)." };
    throw e;
  }
}
