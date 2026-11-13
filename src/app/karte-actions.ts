"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ConflictError } from "@/server/errors";
import { MAP_ICON_KEYS, parseCoord, type MapIcon } from "@/lib/map";
import { createCategory, createPoi, deletePoi, updateCategory, updatePoi, type PoiInput } from "@/server/services/map";
import { requireFamily } from "@/server/session";
import { calendarErrorCode, text } from "./action-helpers";

const id = (form: FormData, k: string) => {
  const v = text(form, k);
  return /^[a-z0-9]{1,40}$/.test(v) ? v : "";
};

async function run(path: string, ok: string, job: (a: Awaited<ReturnType<typeof requireFamily>>) => Promise<string | void>) {
  const active = await requireFamily();
  let failure: string | null = null;
  let target = path;
  try {
    target = (await job(active)) || path;
  } catch (e) {
    if (e instanceof ConflictError) failure = "karte-konflikt";
    else if (e instanceof Error && e.name === "ZodError") failure = "eingabe-karte";
    else failure = calendarErrorCode(e);
  }
  revalidatePath("/", "layout");
  redirect(failure ? `${path}?fehler=${failure}` : `${target}?ok=${ok}`);
}

function poiFromForm(form: FormData): PoiInput {
  const rating = Number(text(form, "rating"));
  return {
    name: text(form, "name"),
    categoryId: id(form, "categoryId"),
    lat: parseCoord(text(form, "lat"), "lat"),
    lng: parseCoord(text(form, "lng"), "lng"),
    address: text(form, "address"),
    description: text(form, "description"),
    note: text(form, "note"),
    url: text(form, "url"),
    imageUrl: text(form, "imageUrl"),
    rating: rating >= 1 && rating <= 5 ? rating : null,
    startDate: text(form, "startDate") || null,
    endDate: text(form, "endDate") || null,
  };
}

function categoryFromForm(form: FormData) {
  const icon = text(form, "icon");
  return {
    name: text(form, "name"),
    description: text(form, "description"),
    icon: ((MAP_ICON_KEYS as readonly string[]).includes(icon) ? icon : "") as MapIcon,
    color: text(form, "color") || undefined,
    active: form.get("active") != null,
  };
}

export async function createPoiAction(form: FormData) {
  await run("/karte", "ort", async ({ user, familyId }) => {
    const p = await createPoi(user.id, familyId, poiFromForm(form));
    return `/karte/${p.id}`;
  });
}

export async function updatePoiAction(form: FormData) {
  const poiId = id(form, "poiId");
  await run(`/karte/${poiId}`, "ort", ({ user, familyId }) => updatePoi(user.id, familyId, poiId, poiFromForm(form)));
}

export async function deletePoiAction(form: FormData) {
  const poiId = id(form, "poiId");
  await run(`/karte/${poiId}`, "ort-weg", async ({ user, familyId }) => {
    await deletePoi(user.id, familyId, poiId);
    return "/karte";
  });
}

export async function createCategoryAction(form: FormData) {
  await run("/karte/kategorien", "kategorie", async ({ user, familyId }) => {
    await createCategory(user.id, familyId, categoryFromForm(form));
  });
}

export async function updateCategoryAction(form: FormData) {
  await run("/karte/kategorien", "kategorie", ({ user, familyId }) =>
    updateCategory(user.id, familyId, id(form, "categoryId"), categoryFromForm(form)));
}
