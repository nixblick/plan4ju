"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ConflictError } from "@/server/errors";
import { OCCASIONS, parsePrice, type Occasion } from "@/lib/wishes";
import {
  createWish, createWishlist, deleteWish, deleteWishlist, releaseWish, reserveWish, setReservationGiven, setWishReceived,
  updateWish, updateWishlist, type ListInput, type WishInput,
} from "@/server/services/wishes";
import { requireFamily } from "@/server/session";
import { calendarErrorCode, text } from "./action-helpers";

const id = (form: FormData, k: string) => {
  const v = text(form, k);
  return /^[a-z0-9]{1,40}$/.test(v) ? v : "";
};
const listPath = (form: FormData) => (id(form, "listId") ? `/wuensche/${id(form, "listId")}` : "/wuensche");

async function run(path: string, ok: string, job: (a: Awaited<ReturnType<typeof requireFamily>>) => Promise<string | void>) {
  const active = await requireFamily();
  let failure: string | null = null;
  let target = path;
  try {
    target = (await job(active)) || path;
  } catch (e) {
    if (e instanceof ConflictError) failure = "wunsch-konflikt";
    else if (e instanceof Error && e.name === "ZodError") failure = "eingabe-wunsch";
    else failure = calendarErrorCode(e);
  }
  revalidatePath("/", "layout");
  redirect(failure ? `${path}?fehler=${failure}` : `${target}?ok=${ok}`);
}

function listFromForm(form: FormData): ListInput {
  const owner = text(form, "owner");
  return {
    title: text(form, "title"),
    description: text(form, "description"),
    profileId: owner.startsWith("p:") ? owner.slice(2) : null,
    personName: owner === "person" ? text(form, "personName") : null,
    visibility: text(form, "visibility") === "PRIVATE" ? "PRIVATE" : "FAMILY",
    surprise: form.get("surprise") != null,
    birthdayId: id(form, "birthdayId") || null,
  };
}

function wishFromForm(form: FormData): WishInput {
  const occasion = text(form, "occasion");
  const prio = Number(text(form, "priority"));
  return {
    title: text(form, "title"),
    description: text(form, "description"),
    url: text(form, "url"),
    imageUrl: text(form, "imageUrl"),
    priceCents: parsePrice(text(form, "price")),
    priority: [1, 2, 3].includes(prio) ? prio : 2,
    note: text(form, "note"),
    occasion: (OCCASIONS as readonly string[]).includes(occasion) ? (occasion as Occasion) : "ANY",
  };
}

export async function createWishlistAction(form: FormData) {
  await run("/wuensche", "wunschzettel", async ({ user, familyId }) => `/wuensche/${(await createWishlist(user.id, familyId, listFromForm(form))).id}`);
}

export async function updateWishlistAction(form: FormData) {
  await run(listPath(form), "wunschzettel", ({ user, familyId }) => updateWishlist(user.id, familyId, id(form, "listId"), listFromForm(form)));
}

export async function deleteWishlistAction(form: FormData) {
  await run(listPath(form), "wunschzettel-weg", async ({ user, familyId }) => {
    await deleteWishlist(user.id, familyId, id(form, "listId"));
    return "/wuensche";
  });
}

export async function createWishAction(form: FormData) {
  await run(listPath(form), "wunsch", async ({ user, familyId }) => {
    await createWish(user.id, familyId, id(form, "listId"), wishFromForm(form));
  });
}

export async function updateWishAction(form: FormData) {
  await run(listPath(form), "wunsch", ({ user, familyId }) => updateWish(user.id, familyId, id(form, "wishId"), wishFromForm(form)));
}

export async function deleteWishAction(form: FormData) {
  await run(listPath(form), "wunsch-weg", ({ user, familyId }) => deleteWish(user.id, familyId, id(form, "wishId")));
}

export async function setWishReceivedAction(form: FormData) {
  const on = text(form, "received") === "1";
  await run(listPath(form), on ? "erhalten" : "gespeichert", ({ user, familyId }) => setWishReceived(user.id, familyId, id(form, "wishId"), on));
}

export async function reserveWishAction(form: FormData) {
  await run(listPath(form), "reserviert", ({ user, familyId }) => reserveWish(user.id, familyId, id(form, "wishId")));
}

export async function releaseWishAction(form: FormData) {
  await run(listPath(form), "freigegeben", ({ user, familyId }) => releaseWish(user.id, familyId, id(form, "wishId")));
}

export async function setGivenAction(form: FormData) {
  const on = text(form, "given") === "1";
  await run(listPath(form), on ? "verschenkt" : "gespeichert", ({ user, familyId }) => setReservationGiven(user.id, familyId, id(form, "wishId"), on));
}
