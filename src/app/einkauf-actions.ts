"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { parseIngredientLine } from "@/lib/recipes";
import {
  addShop, clearDone, createItem, deleteItem, deleteShop, moveShop, purgeCleared, renameShop, setItemDone, ShoppingConflictError,
  transferIngredients, updateItem, type ItemInput,
} from "@/server/services/shopping";
import { requireFamily } from "@/server/session";
import { calendarErrorCode, text } from "./action-helpers";

/** Back to the list, keeping the shop filter (a cuid; anything else is dropped). */
const back = (form: FormData) => {
  const shop = text(form, "filter");
  return /^[a-z0-9]{1,40}$/.test(shop) ? `/einkauf?laden=${shop}` : "/einkauf";
};

async function run(path: string, ok: string, job: (a: Awaited<ReturnType<typeof requireFamily>>) => Promise<unknown>) {
  const active = await requireFamily();
  let failure: string | null = null;
  try {
    await job(active);
  } catch (e) {
    if (e instanceof ShoppingConflictError) failure = "einkauf-konflikt";
    else if (e instanceof Error && e.name === "ZodError") failure = "eingabe-einkauf";
    else failure = calendarErrorCode(e);
  }
  revalidatePath("/", "layout");
  const sep = path.includes("?") ? "&" : "?";
  redirect(failure ? `${path}${sep}fehler=${failure}` : `${path}${sep}ok=${ok}`);
}

/** "1,5" or "½" as in recipes; empty means no quantity, garbage fails validation. */
function quantity(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;
  const q = parseIngredientLine(`${s} x`).quantity;
  return q ?? Number.NaN;
}

function itemFromForm(form: FormData): ItemInput {
  return {
    name: text(form, "name"),
    quantity: quantity(text(form, "quantity")),
    unit: text(form, "unit") || null,
    note: text(form, "note") || null,
    shopIds: form.getAll("shopIds").map(String).filter(Boolean),
  };
}

export async function saveItemAction(form: FormData) {
  const id = text(form, "itemId");
  await run(back(form), id ? "gespeichert" : "eintrag", (a) => (id ? updateItem(a.user.id, a.familyId, id, itemFromForm(form)) : createItem(a.user.id, a.familyId, itemFromForm(form))));
}

export async function deleteItemAction(form: FormData) {
  await run(back(form), "eintrag-weg", (a) => deleteItem(a.user.id, a.familyId, text(form, "itemId")));
}

export async function toggleItemAction(form: FormData) {
  const done = text(form, "done") === "1";
  await run(back(form), done ? "abgehakt" : "zurueck", (a) => setItemDone(a.user.id, a.familyId, text(form, "itemId"), done));
}

export async function clearDoneAction(form: FormData) {
  await run(back(form), "weggeraeumt", (a) => clearDone(a.user.id, a.familyId));
}

export async function purgeClearedAction(form: FormData) {
  await run(back(form), "geleert", (a) => purgeCleared(a.user.id, a.familyId));
}

export async function addShopAction(form: FormData) {
  await run("/einkauf/geschaefte", "geschaeft", (a) => addShop(a.user.id, a.familyId, text(form, "name")));
}

export async function renameShopAction(form: FormData) {
  await run("/einkauf/geschaefte", "gespeichert", (a) => renameShop(a.user.id, a.familyId, text(form, "shopId"), text(form, "name")));
}

export async function moveShopAction(form: FormData) {
  await run("/einkauf/geschaefte", "gespeichert", (a) => moveShop(a.user.id, a.familyId, text(form, "shopId"), text(form, "dir") === "up" ? -1 : 1));
}

export async function deleteShopAction(form: FormData) {
  await run("/einkauf/geschaefte", "geschaeft-weg", (a) => deleteShop(a.user.id, a.familyId, text(form, "shopId")));
}

/** Preview form: one checkbox "take" per ingredient id, with quantity, unit and shop fields per id. */
export async function transferAction(form: FormData) {
  const recipeId = text(form, "recipeId");
  const ids = form.getAll("take").map(String).filter(Boolean);
  if (!ids.length) redirect(`/einkauf/rezept/${encodeURIComponent(recipeId)}?fehler=nichts-gewaehlt`);
  const lines = ids.map((id) => ({
    ingredientId: id,
    quantity: quantity(text(form, `q-${id}`)),
    unit: text(form, `u-${id}`) || null,
    shopIds: [text(form, `s-${id}`)].filter(Boolean),
  }));
  await run("/einkauf", "uebertragen", (a) => transferIngredients(a.user.id, a.familyId, { recipeId, lines }));
}
