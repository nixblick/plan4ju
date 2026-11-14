"use server";

import type { RecipeDraft } from "@/lib/recipe-extract";
import { ForbiddenError, RateLimitError } from "@/server/errors";
import { FetchError } from "@/server/safe-fetch";
import { createRecipe, deleteRecipe, importRecipeDraft, RecipeImportError, updateRecipe, type RecipeInput } from "@/server/services/recipes";
import { requireFamily } from "@/server/session";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { calendarErrorCode, localPath, runAction, text } from "./action-helpers";
import { IMAGE_MAX_BYTES, ImageError } from "@/lib/image-clean";
import { removeImage, setImage } from "@/server/services/images";

/** The client form sends the whole recipe as JSON in "payload" (ingredient rows are dynamic). */
function recipeFromForm(form: FormData): RecipeInput {
  const raw = text(form, "payload");
  if (raw.length > 400_000) throw Object.assign(new Error("too large"), { name: "ZodError" });
  try {
    return JSON.parse(raw) as RecipeInput;
  } catch {
    throw Object.assign(new Error("bad payload"), { name: "ZodError" });
  }
}

export async function createRecipeAction(form: FormData) {
  const { user, familyId } = await requireFamily();
  let target: string;
  try {
    const { id } = await createRecipe(user.id, familyId, recipeFromForm(form));
    target = `/rezepte/${encodeURIComponent(id)}?ok=rezept`;
  } catch (e) {
    target = `/rezepte/neu?fehler=${calendarErrorCode(e)}`;
  }
  revalidatePath("/", "layout");
  redirect(target);
}

export async function updateRecipeAction(form: FormData) {
  const id = text(form, "recipeId");
  await runAction(`/rezepte/${encodeURIComponent(id)}`, "gespeichert", (a) => updateRecipe(a.user.id, a.familyId, id, recipeFromForm(form)));
}

export async function deleteRecipeAction(form: FormData) {
  await runAction("/rezepte", "rezept-weg", (a) => deleteRecipe(a.user.id, a.familyId, text(form, "recipeId")));
}

export type ImportState = { status: "idle" } | { status: "ok"; draft: RecipeDraft; n: number } | { status: "error"; message: string };

/** Fixed German messages; never the exception text or the address. */
function importMessage(e: unknown): string {
  if (e instanceof RateLimitError) return "Zu viele Importe. Bitte warte ein paar Minuten.";
  if (e instanceof ForbiddenError) return "Dafür fehlt dir die Berechtigung.";
  if (e instanceof RecipeImportError) return "Auf dieser Seite wurde kein Rezept gefunden. Du kannst es unten von Hand eintragen.";
  if (e instanceof FetchError) {
    switch (e.code) {
      case "protokoll": return "Diese Adresse ist nicht zulässig. Erlaubt ist nur https ohne Benutzer und Passwort.";
      case "blockiert": return "Die Adresse zeigt auf ein internes oder gesperrtes Netz und wird nicht abgerufen.";
      case "aufloesung": return "Der Server der Adresse wurde nicht gefunden.";
      case "zeit": return "Die Seite hat zu lange gebraucht.";
      case "gross": return "Die Seite ist zu groß.";
      case "status": return `Die Seite antwortet mit Fehler ${e.status ?? ""}.`.replace(" .", ".");
      case "umleitung": return "Die Seite leitet unzulässig weiter.";
      default: return "Die Seite konnte nicht abgerufen werden.";
    }
  }
  throw e;
}

export async function importRecipeAction(prev: ImportState, form: FormData): Promise<ImportState> {
  const { user, familyId } = await requireFamily();
  try {
    const draft = await importRecipeDraft(user.id, familyId, text(form, "url"));
    return { status: "ok", draft, n: prev.status === "ok" ? prev.n + 1 : 1 };
  } catch (e) {
    return { status: "error", message: importMessage(e) };
  }
}

function fileBytes(form: FormData): Promise<Uint8Array> {
  const f = form.get("bild");
  if (!(f instanceof File) || f.size === 0) return Promise.resolve(new Uint8Array());
  if (f.size > IMAGE_MAX_BYTES) throw new ImageError("gross");
  return f.arrayBuffer().then((b) => new Uint8Array(b));
}

function imageErrorCode(e: unknown): string {
  if (e instanceof ImageError) return e.code === "gross" ? "bild-gross" : "bild-typ";
  return calendarErrorCode(e);
}

/** Upload or replace the picture of a recipe or wish; `back` is the page to return to. */
export async function uploadImageAction(form: FormData) {
  const { user, familyId } = await requireFamily();
  const kind = text(form, "kind") === "wish" ? "wish" : "recipe";
  const back = localPath(text(form, "back"), "/");
  let failure: string | null = null;
  try {
    await setImage(user.id, familyId, { kind, id: text(form, "ownerId") }, await fileBytes(form));
  } catch (e) {
    failure = imageErrorCode(e);
  }
  revalidatePath("/", "layout");
  redirect(`${back}?${failure ? `fehler=${failure}` : "ok=bild"}`);
}

export async function removeImageAction(form: FormData) {
  const kind = text(form, "kind") === "wish" ? "wish" : "recipe";
  await runAction(localPath(text(form, "back"), "/"), "bild-weg", (a) => removeImage(a.user.id, a.familyId, { kind, id: text(form, "ownerId") }));
}
