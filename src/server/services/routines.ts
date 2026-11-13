import { z } from "zod";
import type { Prisma, PrismaClient } from "@prisma/client";
import { NotFoundError } from "../errors";
import { withFamily, type FamilyContext } from "../tenant";
import { occurrencesBetween, type RecurrenceRule } from "../../lib/recurrence";
import { addDays, todayIn } from "../../lib/week";

/**
 * Routine occurrences are created ahead of time, but only a bounded window:
 *  - from today (in the family time zone) on, never into the past,
 *  - up to HORIZON_DAYS ahead of today,
 *  - topped up lazily (whenever the family pages are rendered) once less than REFILL_BELOW_DAYS are left.
 * Changing a routine rebuilds only future occurrences that are still open and were not assigned by hand.
 * Done, skipped, customized and past occurrences are never touched.
 */
export const HORIZON_DAYS = 56;
export const REFILL_BELOW_DAYS = 28;

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, "Invalid date");

export const routineInput = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2000).nullish(),
    freq: z.enum(["DAILY", "WEEKLY", "MONTHLY"]).default("DAILY"),
    interval: z.coerce.number().int().min(1).max(52).default(1),
    weekdays: z.array(z.coerce.number().int().min(0).max(6)).max(7).default([]),
    monthDay: z.coerce.number().int().min(1).max(31).nullish(),
    startDate: isoDate,
    endDate: isoDate.nullish(),
    timeOfDay: z.string().regex(HHMM).nullish(),
    assignMode: z.enum(["FIXED", "ROTATING", "PER_OCCURRENCE"]).default("FIXED"),
    /** Order matters for ROTATING. */
    assigneeIds: z.array(z.string()).max(20).default([]),
  })
  .refine((r) => !r.endDate || r.endDate >= r.startDate, { message: "End before start", path: ["endDate"] });
export type RoutineInput = z.input<typeof routineInput>;

export interface OccurrenceView {
  id: string;
  routineId: string;
  title: string;
  date: string;
  time: string | null;
  status: "OPEN" | "DONE" | "SKIPPED";
  customized: boolean;
  assigneeIds: string[];
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const day = (s: string) => new Date(`${s}T00:00:00Z`);

async function assertProfiles(ctx: FamilyContext, ids: string[]) {
  if (ids.length === 0) return;
  const found = await ctx.tx.familyProfile.count({ where: { id: { in: ids }, familyId: ctx.familyId } });
  if (found !== new Set(ids).size) throw new NotFoundError("Unknown profile");
}

const uniq = (ids: string[]) => [...new Set(ids)];

async function familyToday(ctx: FamilyContext, now: Date): Promise<string> {
  const f = await ctx.tx.family.findFirstOrThrow({ where: { id: ctx.familyId }, select: { timezone: true } });
  return todayIn(f.timezone, now);
}

type RoutineRow = Prisma.RoutineGetPayload<{ include: { assignments: true } }>;

export function ruleOf(r: Pick<RoutineRow, "freq" | "interval" | "weekdays" | "monthDay" | "startDate" | "endDate">): RecurrenceRule {
  return {
    freq: r.freq,
    interval: r.interval,
    weekdays: r.weekdays,
    monthDay: r.monthDay,
    startDate: iso(r.startDate),
    endDate: r.endDate ? iso(r.endDate) : null,
  };
}

/** Creates the missing occurrences of one routine (under a row lock, so parallel requests do not duplicate). */
async function materialize(ctx: FamilyContext, routineId: string, today: string, force = false): Promise<void> {
  await ctx.tx.$queryRaw`SELECT id FROM routine WHERE id = ${routineId} FOR UPDATE`;
  const routine = await ctx.tx.routine.findFirst({
    where: { id: routineId, familyId: ctx.familyId },
    include: { assignments: { orderBy: { position: "asc" } } },
  });
  if (!routine || routine.status !== "ACTIVE") return;
  const have = routine.generatedUntil ? iso(routine.generatedUntil) : null;
  if (!force && have && have >= addDays(today, REFILL_BELOW_DAYS)) return;

  const horizon = addDays(today, HORIZON_DAYS);
  const startIso = iso(routine.startDate);
  let from = have ? addDays(have, 1) : startIso;
  if (from < today) from = today;
  if (from <= horizon) {
    const dates = occurrencesBetween(ruleOf(routine), from, horizon);
    if (dates.length) {
      const existing = new Set(
        (
          await ctx.tx.routineOccurrence.findMany({
            where: { routineId, date: { gte: day(dates[0]!), lte: day(dates[dates.length - 1]!) } },
            select: { date: true },
          })
        ).map((o) => iso(o.date)),
      );
      const fresh = dates.filter((d) => !existing.has(d));
      if (fresh.length) {
        await ctx.tx.routineOccurrence.createMany({
          data: fresh.map((d) => ({ familyId: ctx.familyId, routineId, date: day(d), timeOfDay: routine.timeOfDay })),
          skipDuplicates: true,
        });
        const created = await ctx.tx.routineOccurrence.findMany({
          where: { routineId, date: { in: fresh.map(day) } },
          select: { id: true, date: true },
        });
        const ids = routine.assignments.map((a) => a.profileId);
        const base = await ctx.tx.routineOccurrence.count({ where: { routineId, date: { lt: day(fresh[0]!) } } });
        const byDate = new Map(created.map((o) => [iso(o.date), o.id]));
        const rows: Prisma.RoutineOccurrenceAssignmentCreateManyInput[] = [];
        fresh.forEach((d, i) => {
          const occurrenceId = byDate.get(d);
          if (!occurrenceId || ids.length === 0) return;
          const who = routine.assignMode === "FIXED" ? ids : routine.assignMode === "ROTATING" ? [ids[(base + i) % ids.length]!] : [];
          for (const profileId of who) rows.push({ occurrenceId, profileId, familyId: ctx.familyId });
        });
        if (rows.length) await ctx.tx.routineOccurrenceAssignment.createMany({ data: rows, skipDuplicates: true });
      }
    }
  }
  await ctx.tx.routine.update({ where: { id: routineId }, data: { generatedUntil: day(horizon) } });
}

/** Tops up the occurrences of all active routines of the family. Cheap when nothing is missing. */
export async function ensureOccurrences(ctx: FamilyContext, now: Date = new Date()): Promise<string> {
  const today = await familyToday(ctx, now);
  const due = await ctx.tx.routine.findMany({
    where: {
      familyId: ctx.familyId,
      status: "ACTIVE",
      OR: [{ generatedUntil: null }, { generatedUntil: { lt: day(addDays(today, REFILL_BELOW_DAYS)) } }],
    },
    select: { id: true },
  });
  for (const r of due) await materialize(ctx, r.id, today);
  return today;
}

/** Removes future occurrences that no one touched, so that they are rebuilt from the new rule. */
async function dropUntouchedFuture(ctx: FamilyContext, routineId: string, today: string) {
  await ctx.tx.routineOccurrence.deleteMany({
    where: { routineId, familyId: ctx.familyId, date: { gte: day(today) }, status: "OPEN", customized: false },
  });
  await ctx.tx.routine.update({ where: { id: routineId }, data: { generatedUntil: null } });
}

async function replaceAssignees(ctx: FamilyContext, routineId: string, ids: string[]) {
  await ctx.tx.routineAssignment.deleteMany({ where: { routineId, familyId: ctx.familyId } });
  await ctx.tx.routineAssignment.createMany({
    data: uniq(ids).map((profileId, position) => ({ routineId, profileId, familyId: ctx.familyId, position })),
  });
}

const routineInclude = { assignments: { orderBy: { position: "asc" } } } as const satisfies Prisma.RoutineInclude;

export function listRoutines(userId: string, familyId: string, includeArchived = false, client?: PrismaClient) {
  return withFamily(
    userId,
    familyId,
    (ctx) =>
      ctx.tx.routine.findMany({
        where: { familyId: ctx.familyId, ...(includeArchived ? {} : { status: { not: "ARCHIVED" } }) },
        include: routineInclude,
        orderBy: [{ status: "asc" }, { title: "asc" }],
      }),
    client,
  );
}

export function getRoutine(userId: string, familyId: string, id: string, client?: PrismaClient) {
  return withFamily(
    userId,
    familyId,
    async (ctx) => {
      const r = await ctx.tx.routine.findFirst({ where: { id, familyId: ctx.familyId }, include: routineInclude });
      if (!r) throw new NotFoundError("Routine not found");
      return r;
    },
    client,
  );
}

export async function createRoutine(userId: string, familyId: string, raw: RoutineInput, client?: PrismaClient, now: Date = new Date()) {
  const data = routineInput.parse(raw);
  return withFamily(
    userId,
    familyId,
    async (ctx) => {
      await assertProfiles(ctx, data.assigneeIds);
      const routine = await ctx.tx.routine.create({
        data: {
          familyId: ctx.familyId,
          title: data.title,
          description: data.description || null,
          freq: data.freq,
          interval: data.interval,
          weekdays: data.freq === "WEEKLY" ? [...new Set(data.weekdays)].sort((a, b) => a - b) : [],
          monthDay: data.freq === "MONTHLY" ? data.monthDay ?? null : null,
          startDate: day(data.startDate),
          endDate: data.endDate ? day(data.endDate) : null,
          timeOfDay: data.timeOfDay ?? null,
          assignMode: data.assignMode,
          createdById: ctx.userId,
        },
      });
      await replaceAssignees(ctx, routine.id, data.assigneeIds);
      await materialize(ctx, routine.id, await familyToday(ctx, now), true);
      return ctx.tx.routine.findFirstOrThrow({ where: { id: routine.id }, include: routineInclude });
    },
    client,
  );
}

export async function updateRoutine(userId: string, familyId: string, id: string, raw: RoutineInput, client?: PrismaClient, now: Date = new Date()) {
  const data = routineInput.parse(raw);
  return withFamily(
    userId,
    familyId,
    async (ctx) => {
      await assertProfiles(ctx, data.assigneeIds);
      const res = await ctx.tx.routine.updateMany({
        where: { id, familyId: ctx.familyId },
        data: {
          title: data.title,
          description: data.description || null,
          freq: data.freq,
          interval: data.interval,
          weekdays: data.freq === "WEEKLY" ? [...new Set(data.weekdays)].sort((a, b) => a - b) : [],
          monthDay: data.freq === "MONTHLY" ? data.monthDay ?? null : null,
          startDate: day(data.startDate),
          endDate: data.endDate ? day(data.endDate) : null,
          timeOfDay: data.timeOfDay ?? null,
          assignMode: data.assignMode,
        },
      });
      if (res.count === 0) throw new NotFoundError("Routine not found");
      await replaceAssignees(ctx, id, data.assigneeIds);
      const today = await familyToday(ctx, now);
      await dropUntouchedFuture(ctx, id, today);
      await materialize(ctx, id, today, true);
      return ctx.tx.routine.findFirstOrThrow({ where: { id }, include: routineInclude });
    },
    client,
  );
}

export function setRoutineStatus(
  userId: string,
  familyId: string,
  id: string,
  status: "ACTIVE" | "PAUSED" | "ARCHIVED",
  client?: PrismaClient,
  now: Date = new Date(),
) {
  return withFamily(
    userId,
    familyId,
    async (ctx) => {
      const res = await ctx.tx.routine.updateMany({ where: { id, familyId: ctx.familyId }, data: { status } });
      if (res.count === 0) throw new NotFoundError("Routine not found");
      const today = await familyToday(ctx, now);
      if (status === "ACTIVE") {
        await ctx.tx.routine.update({ where: { id }, data: { generatedUntil: null } });
        await materialize(ctx, id, today, true);
      } else {
        await dropUntouchedFuture(ctx, id, today);
      }
    },
    client,
  );
}

/** Occurrences of active routines between two local days (inclusive), tops up the window first. */
export function listOccurrences(
  userId: string,
  familyId: string,
  from: string,
  to: string,
  client?: PrismaClient,
  now: Date = new Date(),
): Promise<OccurrenceView[]> {
  return withFamily(
    userId,
    familyId,
    async (ctx) => {
      await ensureOccurrences(ctx, now);
      return occurrencesIn(ctx, from, to);
    },
    client,
  );
}

export async function occurrencesIn(ctx: FamilyContext, from: string, to: string, withSkipped = true): Promise<OccurrenceView[]> {
  const rows = await ctx.tx.routineOccurrence.findMany({
    where: {
      familyId: ctx.familyId,
      date: { gte: day(from), lte: day(to) },
      routine: { status: "ACTIVE" },
      ...(withSkipped ? {} : { status: { not: "SKIPPED" } }),
    },
    include: { routine: { select: { title: true } }, assignments: { select: { profileId: true } } },
    orderBy: [{ date: "asc" }, { timeOfDay: { sort: "asc", nulls: "last" } }, { routine: { title: "asc" } }],
    take: 1000,
  });
  return rows.map((o) => ({
    id: o.id,
    routineId: o.routineId,
    title: o.routine.title,
    date: iso(o.date),
    time: o.timeOfDay,
    status: o.status,
    customized: o.customized,
    assigneeIds: o.assignments.map((a) => a.profileId),
  }));
}

export function setOccurrenceStatus(
  userId: string,
  familyId: string,
  occurrenceId: string,
  status: "OPEN" | "DONE" | "SKIPPED",
  client?: PrismaClient,
) {
  return withFamily(
    userId,
    familyId,
    async (ctx) => {
      const res = await ctx.tx.routineOccurrence.updateMany({
        where: { id: occurrenceId, familyId: ctx.familyId },
        data: { status, doneAt: status === "DONE" ? new Date() : null, doneById: status === "DONE" ? ctx.userId : null },
      });
      if (res.count === 0) throw new NotFoundError("Occurrence not found");
    },
    client,
  );
}

/** Assigns one occurrence by hand; later changes of the routine leave it alone. */
export function setOccurrenceAssignees(
  userId: string,
  familyId: string,
  occurrenceId: string,
  assigneeIds: string[],
  client?: PrismaClient,
) {
  return withFamily(
    userId,
    familyId,
    async (ctx) => {
      await assertProfiles(ctx, assigneeIds);
      const res = await ctx.tx.routineOccurrence.updateMany({
        where: { id: occurrenceId, familyId: ctx.familyId },
        data: { customized: true },
      });
      if (res.count === 0) throw new NotFoundError("Occurrence not found");
      await ctx.tx.routineOccurrenceAssignment.deleteMany({ where: { occurrenceId, familyId: ctx.familyId } });
      await ctx.tx.routineOccurrenceAssignment.createMany({
        data: uniq(assigneeIds).map((profileId) => ({ occurrenceId, profileId, familyId: ctx.familyId })),
      });
    },
    client,
  );
}
