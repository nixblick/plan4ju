import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { allowedVisibilities, NOTE_MAX, TOPICS, VISIBILITIES, type Topic, type Visibility } from "../../lib/achtsamkeit";
import { todayIn } from "../../lib/week";
import { ForbiddenError, NotFoundError } from "../errors";
import { withFamily, type FamilyContext } from "../tenant";

// Mindfulness (docs/achtsamkeit.md). Every read runs as the app role inside the family context, so row
// level security decides what is visible: the author, the family (FAMILY) or selected viewers
// (SELECTED). Roles give no extra sight. Unknown and invisible ids both end in the same NotFoundError,
// and no function returns counts or placeholders for entries the viewer cannot see.

const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => new Date(`${v}T00:00:00Z`).toISOString().startsWith(v));

export const entryInput = z
  .object({
    profileId: z.string().min(1).max(100),
    topic: z.enum(TOPICS),
    date: day,
    rating: z.number().int().min(1).max(5),
    note: z.string().trim().max(NOTE_MAX).nullish().transform((v) => (v ? v : null)),
    visibility: z.enum(VISIBILITIES).default("PRIVATE"),
    viewerIds: z.array(z.string().min(1).max(100)).max(20).default([]),
  })
  .refine((v) => allowedVisibilities(v.topic).includes(v.visibility), { message: "Visibility not allowed", path: ["visibility"] })
  .refine((v) => v.visibility !== "SELECTED" || v.viewerIds.length > 0, { message: "Select viewers", path: ["viewerIds"] });
export type EntryInput = z.input<typeof entryInput>;

export interface EntryView {
  id: string;
  profileId: string;
  profileName: string;
  topic: Topic;
  date: string;
  rating: number;
  note: string | null;
  visibility: Visibility;
  mine: boolean;
  /** Names of the selected viewers; only filled for the author. */
  viewers: { userId: string; name: string }[];
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Profiles the user may write for: the own profile and child profiles without login. */
async function writableProfiles(ctx: FamilyContext) {
  return ctx.tx.familyProfile.findMany({
    where: { familyId: ctx.familyId, OR: [{ userId: ctx.userId }, { isChild: true, userId: null }] },
    orderBy: [{ isChild: "asc" }, { displayName: "asc" }],
    select: { id: true, displayName: true, isChild: true, userId: true },
  });
}

export function listWritableProfiles(userId: string, familyId: string, client?: PrismaClient) {
  return withFamily(userId, familyId, (ctx) => writableProfiles(ctx), client);
}

/** Other members who can be picked as viewers. */
export function listViewerCandidates(userId: string, familyId: string, client?: PrismaClient) {
  return withFamily(userId, familyId, async ({ tx }) => {
    const ms = await tx.familyMembership.findMany({
      where: { familyId, userId: { not: userId } },
      select: { userId: true, user: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    });
    return ms.map((m) => ({ userId: m.userId, name: m.user.name }));
  }, client);
}

async function setViewers(ctx: FamilyContext, entryId: string, visibility: Visibility, viewerIds: string[]) {
  await ctx.tx.mindfulnessShare.deleteMany({ where: { entryId } });
  if (visibility !== "SELECTED") return;
  const ids = [...new Set(viewerIds)].filter((v) => v !== ctx.userId);
  const members = await ctx.tx.familyMembership.findMany({ where: { familyId: ctx.familyId, userId: { in: ids } }, select: { userId: true } });
  if (members.length !== ids.length || ids.length === 0) throw new NotFoundError("Unknown viewer");
  await ctx.tx.mindfulnessShare.createMany({
    data: ids.map((userId) => ({ familyId: ctx.familyId, entryId, ownerId: ctx.userId, userId })),
  });
}

/**
 * Saves the author's rating for a profile, day and topic (one per author; a second save updates it).
 * Only the own profile or a child profile without login.
 */
export async function saveEntry(userId: string, familyId: string, input: EntryInput, client?: PrismaClient) {
  const v = entryInput.parse(input);
  return withFamily(userId, familyId, async (ctx) => {
    const profiles = await writableProfiles(ctx);
    if (!profiles.some((p) => p.id === v.profileId)) throw new ForbiddenError("Not your profile");
    const date = new Date(`${v.date}T00:00:00Z`);
    const data = { rating: v.rating, note: v.note, visibility: v.visibility };
    const existing = await ctx.tx.mindfulnessEntry.findUnique({
      where: { profileId_topic_date_createdById: { profileId: v.profileId, topic: v.topic, date, createdById: userId } },
      select: { id: true },
    });
    const entry = existing
      ? await ctx.tx.mindfulnessEntry.update({ where: { id: existing.id }, data, select: { id: true } })
      : await ctx.tx.mindfulnessEntry.create({
          data: { ...data, familyId, profileId: v.profileId, topic: v.topic, date, createdById: userId },
          select: { id: true },
        });
    await setViewers(ctx, entry.id, v.visibility, v.viewerIds);
    return entry.id;
  }, client);
}

export function deleteEntry(userId: string, familyId: string, entryId: string, client?: PrismaClient) {
  return withFamily(userId, familyId, async ({ tx }) => {
    const r = await tx.mindfulnessEntry.deleteMany({ where: { id: entryId, createdById: userId } });
    if (r.count === 0) throw new NotFoundError("Entry not found");
  }, client);
}

const entrySelect = {
  id: true, profileId: true, topic: true, date: true, rating: true, note: true, visibility: true, createdById: true,
  profile: { select: { displayName: true } },
  shares: { select: { userId: true, viewer: { select: { user: { select: { name: true } } } } } },
} as const;

function toView(userId: string, e: {
  id: string; profileId: string; topic: Topic; date: Date; rating: number; note: string | null; visibility: Visibility; createdById: string;
  profile: { displayName: string }; shares: { userId: string; viewer: { user: { name: string } } }[];
}): EntryView {
  const mine = e.createdById === userId;
  return {
    id: e.id, profileId: e.profileId, profileName: e.profile.displayName, topic: e.topic, date: iso(e.date),
    rating: e.rating, note: e.note, visibility: e.visibility, mine,
    viewers: mine ? e.shares.map((s) => ({ userId: s.userId, name: s.viewer.user.name })) : [],
  };
}

export function getEntry(userId: string, familyId: string, entryId: string, client?: PrismaClient) {
  return withFamily(userId, familyId, async ({ tx }) => {
    const e = await tx.mindfulnessEntry.findUnique({ where: { id: entryId }, select: entrySelect });
    if (!e) throw new NotFoundError("Entry not found");
    return toView(userId, e);
  }, client);
}

/** Visible entries in [from, to] (local days), optionally one profile and topic, newest first. */
export function listEntries(
  userId: string,
  familyId: string,
  q: { from: string; to: string; profileId?: string | null; topic?: Topic | null },
  client?: PrismaClient,
) {
  return withFamily(userId, familyId, async ({ tx }) => {
    const rows = await tx.mindfulnessEntry.findMany({
      where: {
        familyId,
        date: { gte: new Date(`${q.from}T00:00:00Z`), lte: new Date(`${q.to}T00:00:00Z`) },
        ...(q.profileId ? { profileId: q.profileId } : {}),
        ...(q.topic ? { topic: q.topic } : {}),
      },
      orderBy: [{ date: "desc" }, { topic: "asc" }],
      select: entrySelect,
      take: 500,
    });
    return rows.map((e) => toView(userId, e));
  }, client);
}

/**
 * Profiles that have at least one entry visible to this user, for the person picker. A person whose
 * entries are all hidden is not listed, so the picker gives no hint either.
 */
export function listVisibleProfiles(userId: string, familyId: string, client?: PrismaClient) {
  return withFamily(userId, familyId, async ({ tx }) => {
    const rows = await tx.mindfulnessEntry.findMany({
      where: { familyId }, distinct: ["profileId"], select: { profileId: true, profile: { select: { displayName: true } } },
    });
    return rows.map((r) => ({ id: r.profileId, name: r.profile.displayName })).sort((a, b) => a.name.localeCompare(b.name, "de"));
  }, client);
}

/** Today in the family time zone (default date of a new entry). */
export function familyToday(userId: string, familyId: string, now: Date = new Date(), client?: PrismaClient) {
  return withFamily(userId, familyId, async ({ tx }) => {
    const f = await tx.family.findFirst({ where: { id: familyId }, select: { timezone: true } });
    return todayIn(f?.timezone ?? "Europe/Berlin", now);
  }, client);
}
