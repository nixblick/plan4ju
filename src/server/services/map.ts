import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { DEFAULT_CATEGORIES, HEX_COLOR, MAP_ICON_KEYS, MAP_LIMITS as L, type MapIcon } from "../../lib/map";
import { todayIn } from "../../lib/week";
import { httpsUrl } from "../../lib/wishes";
import { ConflictError, ForbiddenError, NotFoundError } from "../errors";
import { assertRole, atLeast } from "../permissions";
import { type FamilyContext } from "../tenant";
import { withModule } from "./modules";

// Map module (docs/karte.md): categories (ADMIN and up manage them), points shared within the family.
// Temporary points (endDate set) are archived lazily once their last local day is over; permanent
// points are never touched by that.

const optText = (max: number) => z.string().trim().max(max).nullish().transform((v) => (v ? v : null));
const https = z
  .string()
  .trim()
  .max(L.url)
  .nullish()
  .transform((v, ctx) => {
    if (!v) return null;
    const u = httpsUrl(v);
    if (!u) ctx.addIssue({ code: "custom", message: "Only https links" });
    return u;
  });
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().startsWith(v))
  .nullish()
  .transform((v) => v || null);

export const categoryInput = z.object({
  name: z.string().trim().min(1).max(L.categoryName),
  description: optText(L.text),
  icon: z.enum(MAP_ICON_KEYS),
  color: z.string().trim().toLowerCase().regex(HEX_COLOR).default("#c2410c"),
  active: z.boolean().default(true),
});
export type CategoryInput = z.input<typeof categoryInput>;

export const poiInput = z
  .object({
    name: z.string().trim().min(1).max(L.name),
    categoryId: z.string().min(1).max(100),
    lat: z.number().finite().min(-90).max(90),
    lng: z.number().finite().min(-180).max(180),
    address: optText(L.address),
    description: optText(L.text),
    note: optText(L.note),
    url: https,
    imageUrl: https,
    rating: z.number().int().min(1).max(5).nullish().transform((v) => v ?? null),
    startDate: day,
    endDate: day,
  })
  .refine((v) => !v.startDate || !v.endDate || v.endDate >= v.startDate, { message: "End before start", path: ["endDate"] })
  .transform((v) => ({ ...v, endDate: v.endDate ?? (v.startDate ? v.startDate : null) }));
export type PoiInput = z.input<typeof poiInput>;

export interface CategoryView {
  id: string;
  name: string;
  description: string | null;
  icon: MapIcon;
  color: string;
  active: boolean;
  poiCount: number;
}

export interface PoiView {
  id: string;
  name: string;
  lat: number;
  lng: number;
  address: string | null;
  description: string | null;
  note: string | null;
  url: string | null;
  imageUrl: string | null;
  rating: number | null;
  startDate: string | null;
  endDate: string | null;
  archived: boolean;
  category: { id: string; name: string; icon: MapIcon; color: string };
  createdById: string;
  creatorName: string;
  createdAt: Date;
  canEdit: boolean;
}

export interface PoiFilter {
  categoryId?: string | null;
  createdById?: string | null;
  q?: string | null;
  archived?: boolean;
}

const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const asDate = (v: string | null) => (v ? new Date(`${v}T00:00:00Z`) : null);
const iconOf = (v: string): MapIcon => ((MAP_ICON_KEYS as readonly string[]).includes(v) ? (v as MapIcon) : "pin");

async function ensureDefaults(ctx: FamilyContext) {
  if (await ctx.tx.mapCategory.count({ where: { familyId: ctx.familyId } })) return;
  await ctx.tx.mapCategory.createMany({
    data: DEFAULT_CATEGORIES.map((c) => ({ familyId: ctx.familyId, ...c })),
    skipDuplicates: true,
  });
}

async function timezoneOf(ctx: FamilyContext) {
  const f = await ctx.tx.family.findFirst({ where: { id: ctx.familyId }, select: { timezone: true } });
  return f?.timezone ?? "Europe/Berlin";
}

/** Archives temporary points whose last local day is before today. Returns the number archived. */
async function archiveExpired(ctx: FamilyContext, now: Date) {
  const today = todayIn(await timezoneOf(ctx), now);
  const r = await ctx.tx.poi.updateMany({
    where: { familyId: ctx.familyId, archivedAt: null, endDate: { not: null, lt: new Date(`${today}T00:00:00Z`) } },
    data: { archivedAt: now },
  });
  return r.count;
}

async function namesOf(ctx: FamilyContext, userIds: string[]): Promise<Map<string, string>> {
  if (!userIds.length) return new Map();
  const rows = await ctx.tx.familyProfile.findMany({
    where: { familyId: ctx.familyId, userId: { in: userIds } },
    select: { userId: true, displayName: true },
  });
  return new Map(rows.map((r) => [r.userId!, r.displayName]));
}

const canEditPoi = (ctx: FamilyContext, createdById: string) => createdById === ctx.userId || atLeast(ctx.role, "ADMIN");

async function viewPois(ctx: FamilyContext, where: object): Promise<PoiView[]> {
  const rows = await ctx.tx.poi.findMany({
    where: { familyId: ctx.familyId, ...where },
    include: { category: { select: { id: true, name: true, icon: true, color: true } } },
    orderBy: [{ startDate: { sort: "asc", nulls: "last" } }, { name: "asc" }, { id: "asc" }],
  });
  const names = await namesOf(ctx, [...new Set(rows.map((r) => r.createdById))]);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    lat: r.lat,
    lng: r.lng,
    address: r.address,
    description: r.description,
    note: r.note,
    url: r.url,
    imageUrl: r.imageUrl,
    rating: r.rating,
    startDate: iso(r.startDate),
    endDate: iso(r.endDate),
    archived: r.archivedAt !== null,
    category: { ...r.category, icon: iconOf(r.category.icon) },
    createdById: r.createdById,
    creatorName: names.get(r.createdById) ?? "Ehemaliges Mitglied",
    createdAt: r.createdAt,
    canEdit: canEditPoi(ctx, r.createdById),
  }));
}

export function listCategories(userId: string, familyId: string, client?: PrismaClient): Promise<CategoryView[]> {
  return withModule("map", 
    userId,
    familyId,
    async (ctx) => {
      await ensureDefaults(ctx);
      const rows = await ctx.tx.mapCategory.findMany({
        where: { familyId: ctx.familyId },
        include: { _count: { select: { pois: true } } },
        orderBy: [{ active: "desc" }, { name: "asc" }],
      });
      return rows.map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description,
        icon: iconOf(c.icon),
        color: c.color,
        active: c.active,
        poiCount: c._count.pois,
      }));
    },
    client,
  );
}

export function listPois(userId: string, familyId: string, filter: PoiFilter = {}, client?: PrismaClient, now = new Date()): Promise<PoiView[]> {
  return withModule("map", 
    userId,
    familyId,
    async (ctx) => {
      await archiveExpired(ctx, now);
      const q = filter.q?.trim().slice(0, L.name);
      return viewPois(ctx, {
        archivedAt: filter.archived ? { not: null } : null,
        ...(filter.categoryId ? { categoryId: filter.categoryId } : {}),
        ...(filter.createdById ? { createdById: filter.createdById } : {}),
        ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
      });
    },
    client,
  );
}

export function getPoi(userId: string, familyId: string, id: string, client?: PrismaClient): Promise<PoiView> {
  return withModule("map", 
    userId,
    familyId,
    async (ctx) => {
      const [p] = await viewPois(ctx, { id });
      if (!p) throw new NotFoundError("Point not found");
      return p;
    },
    client,
  );
}

/** Members who created at least one point (for the creator filter). */
export function listPoiCreators(userId: string, familyId: string, client?: PrismaClient): Promise<{ id: string; name: string }[]> {
  return withModule("map", 
    userId,
    familyId,
    async (ctx) => {
      const rows = await ctx.tx.poi.findMany({ where: { familyId: ctx.familyId }, distinct: ["createdById"], select: { createdById: true } });
      const names = await namesOf(ctx, rows.map((r) => r.createdById));
      return rows
        .map((r) => ({ id: r.createdById, name: names.get(r.createdById) ?? "Ehemaliges Mitglied" }))
        .sort((a, b) => a.name.localeCompare(b.name, "de"));
    },
    client,
  );
}

async function assertCategory(ctx: FamilyContext, id: string, mustBeActive: boolean) {
  const c = await ctx.tx.mapCategory.findFirst({ where: { id, familyId: ctx.familyId }, select: { active: true } });
  if (!c) throw new NotFoundError("Unknown category");
  if (mustBeActive && !c.active) throw new ConflictError("Category inactive");
}

function poiData(d: z.output<typeof poiInput>) {
  return { ...d, startDate: asDate(d.startDate), endDate: asDate(d.endDate) };
}

export function createPoi(userId: string, familyId: string, raw: PoiInput, client?: PrismaClient): Promise<{ id: string }> {
  return withModule("map", 
    userId,
    familyId,
    async (ctx) => {
      const d = poiInput.parse(raw);
      await assertCategory(ctx, d.categoryId, true);
      return ctx.tx.poi.create({ data: { familyId: ctx.familyId, createdById: ctx.userId, ...poiData(d) }, select: { id: true } });
    },
    client,
  );
}

async function loadEditablePoi(ctx: FamilyContext, id: string) {
  const p = await ctx.tx.poi.findFirst({ where: { id, familyId: ctx.familyId }, select: { id: true, createdById: true, categoryId: true } });
  if (!p) throw new NotFoundError("Point not found");
  if (!canEditPoi(ctx, p.createdById)) throw new ForbiddenError("Not your point");
  return p;
}

export function updatePoi(userId: string, familyId: string, id: string, raw: PoiInput, client?: PrismaClient, now = new Date()): Promise<void> {
  return withModule("map", 
    userId,
    familyId,
    async (ctx) => {
      const d = poiInput.parse(raw);
      const p = await loadEditablePoi(ctx, id);
      // An inactive category may be kept, but not newly chosen.
      await assertCategory(ctx, d.categoryId, d.categoryId !== p.categoryId);
      // A changed period reopens an archived point; archiveExpired archives it again if it is still over.
      await ctx.tx.poi.update({ where: { id }, data: { ...poiData(d), archivedAt: null } });
      await archiveExpired(ctx, now);
    },
    client,
  );
}

/** Moves a point (drag on the map or new coordinates). */
export function movePoi(userId: string, familyId: string, id: string, lat: number, lng: number, client?: PrismaClient): Promise<void> {
  return withModule("map", 
    userId,
    familyId,
    async (ctx) => {
      const c = z.object({ lat: z.number().finite().min(-90).max(90), lng: z.number().finite().min(-180).max(180) }).parse({ lat, lng });
      await loadEditablePoi(ctx, id);
      await ctx.tx.poi.update({ where: { id }, data: c });
    },
    client,
  );
}

export function deletePoi(userId: string, familyId: string, id: string, client?: PrismaClient): Promise<void> {
  return withModule("map", 
    userId,
    familyId,
    async (ctx) => {
      await loadEditablePoi(ctx, id);
      await ctx.tx.poi.delete({ where: { id } });
    },
    client,
  );
}

export function createCategory(userId: string, familyId: string, raw: CategoryInput, client?: PrismaClient): Promise<{ id: string }> {
  return withModule("map", 
    userId,
    familyId,
    async (ctx) => {
      assertRole(ctx, "ADMIN");
      const d = categoryInput.parse(raw);
      await ensureDefaults(ctx);
      if (await ctx.tx.mapCategory.findFirst({ where: { familyId: ctx.familyId, name: { equals: d.name, mode: "insensitive" } } }))
        throw new ConflictError("Category exists");
      return ctx.tx.mapCategory.create({ data: { familyId: ctx.familyId, ...d }, select: { id: true } });
    },
    client,
  );
}

export function updateCategory(userId: string, familyId: string, id: string, raw: CategoryInput, client?: PrismaClient): Promise<void> {
  return withModule("map", 
    userId,
    familyId,
    async (ctx) => {
      assertRole(ctx, "ADMIN");
      const d = categoryInput.parse(raw);
      if (!(await ctx.tx.mapCategory.findFirst({ where: { id, familyId: ctx.familyId }, select: { id: true } })))
        throw new NotFoundError("Unknown category");
      if (await ctx.tx.mapCategory.findFirst({ where: { familyId: ctx.familyId, id: { not: id }, name: { equals: d.name, mode: "insensitive" } } }))
        throw new ConflictError("Category exists");
      await ctx.tx.mapCategory.update({ where: { id }, data: d });
    },
    client,
  );
}
