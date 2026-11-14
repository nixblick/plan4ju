import type { Prisma, PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { DEFAULT_FLYERS, FLYER_MAX, flyerInput, parseFlyers, type FlyerLink, type ModuleKey } from "../../lib/modules";
import { todayIn } from "../../lib/week";
import { zonedToUtc } from "../../lib/tz";
import { ConflictError, ModuleOffError, NotFoundError } from "../errors";
import { assertRole } from "../permissions";
import { withFamily, type FamilyContext } from "../tenant";

// Optional modules (docs/module.md). Switched per family by admins; a switched-off module answers like an
// unknown page (NotFound), so nothing of it is reachable, and core functions never depend on it.

export type ModuleState = Record<ModuleKey, boolean>;

const COLUMN = {
  flyers: "moduleFlyers",
  waste: "moduleWaste",
  map: "moduleMap",
  wishes: "moduleWishes",
  mindfulness: "moduleMindfulness",
  meals: "moduleMeals",
} as const satisfies Record<ModuleKey, string>;

async function familyRow(ctx: FamilyContext) {
  return ctx.tx.family.findFirstOrThrow({
    where: { id: ctx.familyId },
    select: {
      moduleFlyers: true,
      moduleWaste: true,
      moduleMap: true,
      moduleWishes: true,
      moduleMindfulness: true,
      moduleMeals: true,
      flyerLinks: true,
      wasteCalendarId: true,
      timezone: true,
    },
  });
}

export async function modulesOf(ctx: FamilyContext): Promise<ModuleState> {
  const f = await familyRow(ctx);
  return {
    flyers: f.moduleFlyers,
    waste: f.moduleWaste,
    map: f.moduleMap,
    wishes: f.moduleWishes,
    mindfulness: f.moduleMindfulness,
    meals: f.moduleMeals,
  };
}

/** Throws NotFound when the module is off: the page and its actions behave as if they did not exist. */
export async function requireModule(ctx: FamilyContext, key: ModuleKey): Promise<void> {
  if (!(await modulesOf(ctx))[key]) throw new ModuleOffError();
}

/** Like withFamily, but the module must be on: every service of a switchable module goes through this. */
export function withModule<T>(
  key: ModuleKey,
  userId: string,
  familyId: string,
  fn: (ctx: FamilyContext) => Promise<T>,
  client?: PrismaClient,
): Promise<T> {
  return withFamily(
    userId,
    familyId,
    async (ctx) => {
      await requireModule(ctx, key);
      return fn(ctx);
    },
    client,
  );
}

export function getModules(userId: string, familyId: string, client?: PrismaClient): Promise<ModuleState> {
  return withFamily(userId, familyId, modulesOf, client);
}

/** Switch a module (admins). Switching the flyers on the first time fills in the starter retailers. */
export function setModule(userId: string, familyId: string, key: ModuleKey, on: boolean, client?: PrismaClient) {
  return withFamily(
    userId,
    familyId,
    async (ctx) => {
      assertRole(ctx, "ADMIN");
      const f = await familyRow(ctx);
      const data: Prisma.FamilyUpdateInput = { [COLUMN[key]]: on };
      if (key === "flyers" && on && parseFlyers(f.flyerLinks).length === 0) {
        data.flyerLinks = DEFAULT_FLYERS.map((d) => ({ ...d, id: randomUUID() })) as unknown as Prisma.InputJsonValue;
      }
      await ctx.tx.family.update({ where: { id: familyId }, data });
    },
    client,
  );
}

// ---- Prospekte ----

export interface FlyerView {
  links: FlyerLink[];
  canManage: boolean;
}

export function getFlyers(userId: string, familyId: string, client?: PrismaClient): Promise<FlyerView> {
  return withFamily(
    userId,
    familyId,
    async (ctx) => {
      await requireModule(ctx, "flyers");
      const f = await familyRow(ctx);
      const canManage = ctx.role !== "MEMBER";
      const links = parseFlyers(f.flyerLinks);
      return { links: canManage ? links : links.filter((l) => l.active), canManage };
    },
    client,
  );
}

async function changeFlyers(userId: string, familyId: string, change: (links: FlyerLink[]) => FlyerLink[], client?: PrismaClient) {
  return withFamily(
    userId,
    familyId,
    async (ctx) => {
      assertRole(ctx, "ADMIN");
      await requireModule(ctx, "flyers");
      const links = change(parseFlyers((await familyRow(ctx)).flyerLinks));
      await ctx.tx.family.update({ where: { id: familyId }, data: { flyerLinks: links as unknown as Prisma.InputJsonValue } });
    },
    client,
  );
}

export async function addFlyer(userId: string, familyId: string, raw: { name: string; url: string }, client?: PrismaClient) {
  const input = flyerInput.parse(raw);
  return changeFlyers(userId, familyId, (links) => {
    if (links.length >= FLYER_MAX) throw new ConflictError("Too many flyer links");
    return [...links, { id: randomUUID(), ...input, active: true }];
  }, client);
}

export async function updateFlyer(userId: string, familyId: string, id: string, raw: { name: string; url: string; active: boolean }, client?: PrismaClient) {
  const input = flyerInput.parse(raw);
  return changeFlyers(userId, familyId, (links) => {
    if (!links.some((l) => l.id === id)) throw new NotFoundError("Flyer link not found");
    return links.map((l) => (l.id === id ? { ...l, ...input, active: raw.active } : l));
  }, client);
}

export function deleteFlyer(userId: string, familyId: string, id: string, client?: PrismaClient) {
  return changeFlyers(userId, familyId, (links) => {
    if (!links.some((l) => l.id === id)) throw new NotFoundError("Flyer link not found");
    return links.filter((l) => l.id !== id);
  }, client);
}

// ---- Abfall ----

export interface Pickup {
  id: string;
  title: string;
  date: string; // local day
}

export interface WasteView {
  calendar: { id: string; name: string; status: "ok" | "error" | "never" | "off" } | null;
  pickups: Pickup[];
  calendars: { id: string; name: string }[]; // choices, admins only
  canManage: boolean;
}

/** Next pickups from the chosen calendar, read from the stored events only (never fetches). */
export async function wastePickups(ctx: FamilyContext, now: Date, take: number): Promise<WasteView> {
  const f = await familyRow(ctx);
  const canManage = ctx.role !== "MEMBER";
  const calendars = canManage
    ? await ctx.tx.externalCalendar.findMany({ where: { familyId: ctx.familyId }, select: { id: true, name: true }, orderBy: { name: "asc" } })
    : [];
  if (!f.wasteCalendarId) return { calendar: null, pickups: [], calendars, canManage };
  const cal = await ctx.tx.externalCalendar.findFirst({
    where: { id: f.wasteCalendarId, familyId: ctx.familyId },
    select: { id: true, name: true, enabled: true, kind: true, lastError: true, lastSuccessAt: true, eventCount: true },
  });
  if (!cal) return { calendar: null, pickups: [], calendars, canManage };
  const status = !cal.enabled ? "off" : cal.lastError ? "error" : cal.kind === "SUBSCRIPTION" && !cal.lastSuccessAt ? "never" : "ok";
  const today = todayIn(f.timezone, now);
  const startOfToday = zonedToUtc(today, "00:00", f.timezone);
  const events = await ctx.tx.externalCalendarEvent.findMany({
    where: {
      familyId: ctx.familyId,
      calendarId: cal.id,
      OR: [{ startDate: { gte: new Date(today) } }, { startsAt: { gte: startOfToday } }],
    },
    orderBy: [{ startDate: "asc" }, { startsAt: "asc" }],
    take: 200,
    select: { id: true, title: true, startDate: true, startsAt: true },
  });
  const day = (e: (typeof events)[number]) =>
    e.startDate ? e.startDate.toISOString().slice(0, 10) : e.startsAt ? todayIn(f.timezone, e.startsAt) : "";
  const pickups = events
    .map((e) => ({ id: e.id, title: e.title, date: day(e) }))
    .filter((p) => p.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title, "de"))
    .slice(0, take);
  return { calendar: { id: cal.id, name: cal.name, status }, pickups, calendars, canManage };
}

export function getWaste(userId: string, familyId: string, now: Date = new Date(), client?: PrismaClient): Promise<WasteView> {
  return withFamily(
    userId,
    familyId,
    async (ctx) => {
      await requireModule(ctx, "waste");
      return wastePickups(ctx, now, 10);
    },
    client,
  );
}

/** Choose (or clear with null) the waste calendar among the family's external calendars (admins). */
export function setWasteCalendar(userId: string, familyId: string, calendarId: string | null, client?: PrismaClient) {
  return withFamily(
    userId,
    familyId,
    async (ctx) => {
      assertRole(ctx, "ADMIN");
      await requireModule(ctx, "waste");
      if (calendarId) {
        const cal = await ctx.tx.externalCalendar.findFirst({ where: { id: calendarId, familyId }, select: { id: true } });
        if (!cal) throw new NotFoundError("Calendar not found");
      }
      await ctx.tx.family.update({ where: { id: familyId }, data: { wasteCalendarId: calendarId } });
    },
    client,
  );
}
