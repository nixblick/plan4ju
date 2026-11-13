import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { addDays, todayIn, weekOf } from "../../lib/week";
import { ConflictError, NotFoundError } from "../errors";
import { type FamilyContext } from "../tenant";
import { withModule } from "./modules";

export const DEFAULT_MEAL_SLOTS = ["Frühstück", "Mittag", "Abend"] as const;
export const MEAL_LIMITS = { slots: 8, slotName: 40, text: 200, cooks: 10 } as const;

/** Slot name, recipe or text, or a moved meal is already taken. */
export class MealConflictError extends ConflictError {
  constructor(message = "Meal slot conflict") {
    super(message);
    this.name = "MealConflictError";
  }
}

/** A unique index lost a race (two concurrent plans of one slot, same slot name): conflict, not 500. */
function uniqueToConflict(e: unknown): never {
  if (e && typeof e === "object" && (e as { code?: unknown }).code === "P2002") throw new MealConflictError("Unique constraint");
  throw e;
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s), "Invalid date");

export const mealInput = z
  .object({
    date: isoDate,
    slotId: z.string().min(1).max(100),
    recipeId: z.string().max(100).nullish().transform((v) => v || null),
    text: z.string().trim().max(MEAL_LIMITS.text).nullish().transform((v) => v || null),
    cookIds: z.array(z.string().max(100)).max(MEAL_LIMITS.cooks).default([]).transform((a) => [...new Set(a)]),
  })
  .refine((m) => m.recipeId || m.text, { message: "A meal needs a recipe or a text", path: ["text"] });
export type MealInput = z.input<typeof mealInput>;

const slotName = z.string().trim().min(1).max(MEAL_LIMITS.slotName);

const toDate = (iso: string) => new Date(`${iso}T00:00:00Z`);
const toIso = (d: Date) => d.toISOString().slice(0, 10);

/** Creates the default slots once; concurrent first renders cannot create duplicates. */
async function ensureSlots(ctx: FamilyContext) {
  const n = await ctx.tx.mealSlot.count({ where: { familyId: ctx.familyId } });
  if (n === 0) {
    await ctx.tx.mealSlot.createMany({
      data: DEFAULT_MEAL_SLOTS.map((name, position) => ({ familyId: ctx.familyId, name, position })),
      skipDuplicates: true,
    });
  }
  return ctx.tx.mealSlot.findMany({ where: { familyId: ctx.familyId }, orderBy: [{ position: "asc" }, { name: "asc" }], select: { id: true, name: true, position: true } });
}

export interface MealView {
  id: string;
  date: string;
  slotId: string;
  recipeId: string | null;
  recipeTitle: string | null;
  imageUrl: string | null;
  text: string | null;
  cookIds: string[];
}

export interface MealWeek {
  today: string;
  days: string[];
  slots: { id: string; name: string; position: number }[];
  meals: MealView[];
}

async function mealsBetween(ctx: FamilyContext, from: string, to: string): Promise<MealView[]> {
  const rows = await ctx.tx.meal.findMany({
    where: { familyId: ctx.familyId, date: { gte: toDate(from), lte: toDate(to) } },
    include: { recipe: { select: { title: true, imageUrl: true } }, cooks: { select: { profileId: true } } },
    orderBy: [{ date: "asc" }],
  });
  return rows.map((m) => ({
    id: m.id,
    date: toIso(m.date),
    slotId: m.slotId,
    recipeId: m.recipeId,
    recipeTitle: m.recipe?.title ?? null,
    imageUrl: m.recipe?.imageUrl ?? null,
    text: m.text,
    cookIds: m.cooks.map((c) => c.profileId),
  }));
}

async function familyToday(ctx: FamilyContext, now: Date) {
  const fam = await ctx.tx.family.findUnique({ where: { id: ctx.familyId }, select: { timezone: true } });
  return todayIn(fam?.timezone ?? "Europe/Berlin", now);
}

/** The week (Mon-Sun) containing `iso`, or the current week of the family. */
export function getMealWeek(userId: string, familyId: string, iso?: string | null, now = new Date(), client?: PrismaClient): Promise<MealWeek> {
  return withModule("meals", 
    userId,
    familyId,
    async (ctx) => {
      const today = await familyToday(ctx, now);
      const anchor = iso && isoDate.safeParse(iso).success ? iso : today;
      const days = weekOf(anchor);
      const slots = await ensureSlots(ctx);
      return { today, days, slots, meals: await mealsBetween(ctx, days[0]!, days[6]!) };
    },
    client,
  );
}

/** Meals of one day (dashboard), slots in order. */
export function mealsOn(ctx: FamilyContext, iso: string) {
  return mealsBetween(ctx, iso, iso);
}

async function assertRefs(ctx: FamilyContext, d: z.output<typeof mealInput>) {
  const slot = await ctx.tx.mealSlot.count({ where: { id: d.slotId, familyId: ctx.familyId } });
  if (!slot) throw new NotFoundError("Unknown slot");
  if (d.recipeId) {
    const r = await ctx.tx.recipe.count({ where: { id: d.recipeId, familyId: ctx.familyId } });
    if (!r) throw new NotFoundError("Unknown recipe");
  }
  if (d.cookIds.length) {
    const found = await ctx.tx.familyProfile.count({ where: { id: { in: d.cookIds }, familyId: ctx.familyId } });
    if (found !== d.cookIds.length) throw new NotFoundError("Unknown profile");
  }
}

async function slotTaken(ctx: FamilyContext, date: string, slotId: string, exceptId?: string) {
  const other = await ctx.tx.meal.findFirst({ where: { familyId: ctx.familyId, date: toDate(date), slotId, ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { id: true } });
  return Boolean(other);
}

/** Plans a meal in an empty slot. */
export async function createMeal(userId: string, familyId: string, raw: MealInput, client?: PrismaClient) {
  const d = mealInput.parse(raw);
  return withModule("meals", 
    userId,
    familyId,
    async (ctx) => {
      await assertRefs(ctx, d);
      if (await slotTaken(ctx, d.date, d.slotId)) throw new MealConflictError("Slot already planned");
      const m = await ctx.tx.meal.create({
        data: { familyId: ctx.familyId, date: toDate(d.date), slotId: d.slotId, recipeId: d.recipeId, text: d.recipeId ? null : d.text, createdById: ctx.userId },
        select: { id: true },
      });
      if (d.cookIds.length) await ctx.tx.mealCook.createMany({ data: d.cookIds.map((profileId) => ({ mealId: m.id, profileId, familyId: ctx.familyId })) });
      return m;
    },
    client,
  ).catch(uniqueToConflict);
}

/** Edits a meal; a new date or slot moves it (refused if the target is taken). */
export async function updateMeal(userId: string, familyId: string, id: string, raw: MealInput, client?: PrismaClient) {
  const d = mealInput.parse(raw);
  return withModule("meals", 
    userId,
    familyId,
    async (ctx) => {
      const existing = await ctx.tx.meal.findFirst({ where: { id, familyId: ctx.familyId }, select: { id: true } });
      if (!existing) throw new NotFoundError("Meal not found");
      await assertRefs(ctx, d);
      if (await slotTaken(ctx, d.date, d.slotId, id)) throw new MealConflictError("Target slot already planned");
      await ctx.tx.meal.updateMany({
        where: { id, familyId: ctx.familyId },
        data: { date: toDate(d.date), slotId: d.slotId, recipeId: d.recipeId, text: d.recipeId ? null : d.text },
      });
      await ctx.tx.mealCook.deleteMany({ where: { mealId: id, familyId: ctx.familyId } });
      if (d.cookIds.length) await ctx.tx.mealCook.createMany({ data: d.cookIds.map((profileId) => ({ mealId: id, profileId, familyId: ctx.familyId })) });
    },
    client,
  ).catch(uniqueToConflict);
}

export function deleteMeal(userId: string, familyId: string, id: string, client?: PrismaClient) {
  return withModule("meals", 
    userId,
    familyId,
    async (ctx) => {
      const res = await ctx.tx.meal.deleteMany({ where: { id, familyId: ctx.familyId } });
      if (res.count === 0) throw new NotFoundError("Meal not found");
    },
    client,
  );
}

/**
 * Copies the meals (with cooks) of the week containing `fromIso` one week ahead (or to the week of `toIso`).
 * Slots already planned in the target week are never overwritten. Returns the number of copied meals.
 */
export function copyMealWeek(userId: string, familyId: string, fromIso: string, toIso?: string | null, client?: PrismaClient) {
  const from = isoDate.parse(fromIso);
  const target = toIso ? isoDate.parse(toIso) : addDays(from, 7);
  return withModule("meals", 
    userId,
    familyId,
    async (ctx) => {
      const src = weekOf(from);
      const dst = weekOf(target);
      if (src[0] === dst[0]) return 0;
      const meals = await mealsBetween(ctx, src[0]!, src[6]!);
      const taken = new Set((await mealsBetween(ctx, dst[0]!, dst[6]!)).map((m) => `${m.date}|${m.slotId}`));
      let n = 0;
      for (const m of meals) {
        const date = dst[src.indexOf(m.date)]!;
        if (taken.has(`${date}|${m.slotId}`)) continue;
        const c = await ctx.tx.meal.create({
          data: { familyId: ctx.familyId, date: toDate(date), slotId: m.slotId, recipeId: m.recipeId, text: m.text, createdById: ctx.userId },
          select: { id: true },
        });
        if (m.cookIds.length) await ctx.tx.mealCook.createMany({ data: m.cookIds.map((profileId) => ({ mealId: c.id, profileId, familyId: ctx.familyId })) });
        n += 1;
      }
      return n;
    },
    client,
  );
}

// ---- slots (meals of the day) ----

export function addMealSlot(userId: string, familyId: string, rawName: string, client?: PrismaClient) {
  const name = slotName.parse(rawName);
  return withModule("meals", 
    userId,
    familyId,
    async (ctx) => {
      const slots = await ensureSlots(ctx);
      if (slots.length >= MEAL_LIMITS.slots) throw new MealConflictError("Too many slots");
      if (slots.some((s) => s.name.toLowerCase() === name.toLowerCase())) throw new MealConflictError("Slot name taken");
      const max = Math.max(-1, ...slots.map((s) => s.position));
      return ctx.tx.mealSlot.create({ data: { familyId: ctx.familyId, name, position: max + 1 }, select: { id: true } });
    },
    client,
  ).catch(uniqueToConflict);
}

export function renameMealSlot(userId: string, familyId: string, id: string, rawName: string, client?: PrismaClient) {
  const name = slotName.parse(rawName);
  return withModule("meals", 
    userId,
    familyId,
    async (ctx) => {
      const slots = await ensureSlots(ctx);
      if (!slots.some((s) => s.id === id)) throw new NotFoundError("Slot not found");
      if (slots.some((s) => s.id !== id && s.name.toLowerCase() === name.toLowerCase())) throw new MealConflictError("Slot name taken");
      await ctx.tx.mealSlot.updateMany({ where: { id, familyId: ctx.familyId }, data: { name } });
    },
    client,
  ).catch(uniqueToConflict);
}

/** Moves a slot one place up (-1) or down (+1). */
export function moveMealSlot(userId: string, familyId: string, id: string, dir: -1 | 1, client?: PrismaClient) {
  return withModule("meals", 
    userId,
    familyId,
    async (ctx) => {
      const slots = await ensureSlots(ctx);
      const i = slots.findIndex((s) => s.id === id);
      if (i < 0) throw new NotFoundError("Slot not found");
      const j = i + dir;
      if (j < 0 || j >= slots.length) return;
      const order = slots.map((s) => s.id);
      [order[i], order[j]] = [order[j]!, order[i]!];
      for (const [position, sid] of order.entries()) await ctx.tx.mealSlot.updateMany({ where: { id: sid, familyId: ctx.familyId }, data: { position } });
    },
    client,
  );
}

/** Deletes a slot with its planned meals; the last slot stays. */
export function deleteMealSlot(userId: string, familyId: string, id: string, client?: PrismaClient) {
  return withModule("meals", 
    userId,
    familyId,
    async (ctx) => {
      const slots = await ensureSlots(ctx);
      if (!slots.some((s) => s.id === id)) throw new NotFoundError("Slot not found");
      if (slots.length <= 1) throw new MealConflictError("Last slot");
      await ctx.tx.mealSlot.deleteMany({ where: { id, familyId: ctx.familyId } });
    },
    client,
  );
}
