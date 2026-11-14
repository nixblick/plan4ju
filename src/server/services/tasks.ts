import { z } from "zod";
import { ForbiddenError, NotFoundError } from "../errors";
import { withFamily, type FamilyContext } from "../tenant";
import type { Prisma, PrismaClient } from "@prisma/client";
import { compareByDue, DEFAULT_PRIORITY, PRIORITIES } from "../../lib/priority";

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export const taskInput = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2000).nullish(),
    dueDate: z.coerce.date().nullish(),
    dueTime: z.string().regex(HHMM).nullish(),
    priority: z.enum(PRIORITIES).default(DEFAULT_PRIORITY),
    /** Shown in the dashboard calendar. */
    showOnDashboard: z.boolean().default(false),
    /** Omitted on update: the status stays as it is. */
    status: z.enum(["OPEN", "IN_PROGRESS", "DONE"]).optional(),
    assigneeIds: z.array(z.string()).max(20).default([]),
  })
  .refine((t) => !t.dueTime || t.dueDate, { message: "A time needs a due date", path: ["dueTime"] });
export type TaskInput = z.input<typeof taskInput>;

/** Views of the task list. "offen" = not done and not archived. */
export const TASK_FILTERS = ["offen", "meine", "unzugewiesen", "erledigt", "alle", "archiv"] as const;
export type TaskFilter = (typeof TASK_FILTERS)[number];

export interface TaskQuery {
  filter?: TaskFilter;
  /** Only tasks assigned to this profile. */
  profileId?: string;
  /** Due date range, inclusive, "YYYY-MM-DD". */
  from?: string;
  to?: string;
}

const include = { assignments: { select: { profileId: true, state: true, assignedById: true } } } as const;

/**
 * Initial state of a new assignment (issue 16): the own profile and child profiles without login are
 * accepted right away; everyone else is asked first (PENDING).
 */
async function newAssignments(ctx: FamilyContext, taskId: string | null, ids: string[]) {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return [];
  const profiles = await ctx.tx.familyProfile.findMany({
    where: { id: { in: unique }, familyId: ctx.familyId },
    select: { id: true, userId: true, isChild: true },
  });
  return profiles.map((p) => ({
    ...(taskId ? { taskId } : {}),
    profileId: p.id,
    familyId: ctx.familyId,
    assignedById: ctx.userId,
    state: (p.userId === ctx.userId || (p.isChild && p.userId === null) ? "ACCEPTED" : "PENDING") as "ACCEPTED" | "PENDING",
  }));
}

/** Profile of the signed-in user in the active family, or null. */
async function myProfileId(ctx: FamilyContext): Promise<string | null> {
  const me = await ctx.tx.familyProfile.findFirst({ where: { familyId: ctx.familyId, userId: ctx.userId }, select: { id: true } });
  return me?.id ?? null;
}

async function assertProfiles(ctx: FamilyContext, ids: string[]) {
  if (ids.length === 0) return;
  const found = await ctx.tx.familyProfile.count({ where: { id: { in: ids }, familyId: ctx.familyId } });
  if (found !== new Set(ids).size) throw new NotFoundError("Unknown profile");
}

const order = [{ status: "asc" }, { dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }] as Prisma.TaskOrderByWithRelationInput[];

/** Not archived tasks of the family. */
export function listTasks(userId: string, familyId: string, client?: PrismaClient) {
  return findTasks(userId, familyId, { filter: "alle" }, client);
}

export function findTasks(userId: string, familyId: string, query: TaskQuery = {}, client?: PrismaClient) {
  return withFamily(
    userId,
    familyId,
    async (ctx) => {
      const where: Prisma.TaskWhereInput = { familyId: ctx.familyId, archivedAt: null };
      switch (query.filter ?? "offen") {
        case "offen":
          where.status = { not: "DONE" };
          break;
        case "erledigt":
          where.status = "DONE";
          break;
        case "unzugewiesen":
          where.status = { not: "DONE" };
          where.assignments = { none: {} };
          break;
        case "meine": {
          const me = await myProfileId(ctx);
          where.status = { not: "DONE" };
          where.assignments = { some: { profileId: me ?? "-" } };
          break;
        }
        case "archiv":
          where.archivedAt = { not: null };
          break;
        case "alle":
          break;
      }
      if (query.profileId) where.assignments = { some: { profileId: query.profileId } };
      if (query.from || query.to) {
        where.dueDate = {
          ...(query.from ? { gte: new Date(query.from) } : {}),
          ...(query.to ? { lte: new Date(query.to) } : {}),
        };
      }
      const byDone = query.filter === "archiv" || query.filter === "erledigt";
      const rows = await ctx.tx.task.findMany({
        where,
        include,
        orderBy: byDone ? [{ doneAt: "desc" }, { createdAt: "desc" }] : order,
        take: 500,
      });
      // Open lists: strictly by due date (no date last), then priority; the DB order is only a tie-break.
      return byDone ? rows : rows.sort(compareByDue);
    },
    client,
  );
}

export function getTask(userId: string, familyId: string, id: string, client?: PrismaClient) {
  return withFamily(
    userId,
    familyId,
    async (ctx) => {
      const task = await ctx.tx.task.findFirst({ where: { id, familyId: ctx.familyId }, include });
      if (!task) throw new NotFoundError("Task not found");
      return task;
    },
    client,
  );
}

export async function createTask(userId: string, familyId: string, raw: TaskInput, client?: PrismaClient) {
  const data = taskInput.parse(raw);
  return withFamily(
    userId,
    familyId,
    async (ctx) => {
      await assertProfiles(ctx, data.assigneeIds);
      const assignments = await newAssignments(ctx, null, data.assigneeIds);
      return ctx.tx.task.create({
        data: {
          familyId: ctx.familyId,
          title: data.title,
          description: data.description || null,
          dueDate: data.dueDate ?? null,
          dueTime: data.dueDate ? data.dueTime ?? null : null,
          priority: data.priority,
          showOnDashboard: data.showOnDashboard,
          status: data.status ?? "OPEN",
          doneAt: data.status === "DONE" ? new Date() : null,
          createdById: ctx.userId,
          assignments: { create: assignments },
        },
        include,
      });
    },
    client,
  );
}

export async function updateTask(
  userId: string,
  familyId: string,
  id: string,
  raw: TaskInput,
  client?: PrismaClient,
) {
  const data = taskInput.parse(raw);
  return withFamily(
    userId,
    familyId,
    async (ctx) => {
      await assertProfiles(ctx, data.assigneeIds);
      const current = await ctx.tx.task.findFirst({ where: { id, familyId: ctx.familyId }, select: { status: true, doneAt: true } });
      if (!current) throw new NotFoundError("Task not found");
      const status = data.status ?? current.status;
      // updateMany with familyId in the filter: a foreign id matches zero rows.
      const res = await ctx.tx.task.updateMany({
        where: { id, familyId: ctx.familyId },
        data: {
          title: data.title,
          description: data.description || null,
          dueDate: data.dueDate ?? null,
          dueTime: data.dueDate ? data.dueTime ?? null : null,
          priority: data.priority,
          showOnDashboard: data.showOnDashboard,
          status,
          doneAt: status === "DONE" ? current.doneAt ?? new Date() : null,
        },
      });
      if (res.count === 0) throw new NotFoundError("Task not found");
      // Diff, not replace: unchanged assignees keep their state (an edit does not ask again).
      const wanted = [...new Set(data.assigneeIds)];
      const existing = (await ctx.tx.taskAssignment.findMany({ where: { taskId: id, familyId: ctx.familyId }, select: { profileId: true } })).map((a) => a.profileId);
      await ctx.tx.taskAssignment.deleteMany({ where: { taskId: id, familyId: ctx.familyId, profileId: { notIn: wanted } } });
      const added = await newAssignments(ctx, id, wanted.filter((p) => !existing.includes(p)));
      if (added.length) await ctx.tx.taskAssignment.createMany({ data: added as Prisma.TaskAssignmentCreateManyInput[] });
      return ctx.tx.task.findFirstOrThrow({ where: { id, familyId: ctx.familyId }, include });
    },
    client,
  );
}

export function setTaskStatus(
  userId: string,
  familyId: string,
  id: string,
  status: "OPEN" | "IN_PROGRESS" | "DONE",
  client?: PrismaClient,
) {
  return withFamily(
    userId,
    familyId,
    async (ctx) => {
      const current = await ctx.tx.task.findFirst({ where: { id, familyId: ctx.familyId }, select: { doneAt: true } });
      if (!current) throw new NotFoundError("Task not found");
      await ctx.tx.task.updateMany({
        where: { id, familyId: ctx.familyId },
        data: { status, doneAt: status === "DONE" ? current.doneAt ?? new Date() : null },
      });
    },
    client,
  );
}

export function setTaskDone(userId: string, familyId: string, id: string, done: boolean, client?: PrismaClient) {
  return setTaskStatus(userId, familyId, id, done ? "DONE" : "OPEN", client);
}

/** Archive keeps the task (and its history) but removes it from lists and the dashboard. */
export function setTaskArchived(userId: string, familyId: string, id: string, archived: boolean, client?: PrismaClient) {
  return withFamily(
    userId,
    familyId,
    async (ctx) => {
      const res = await ctx.tx.task.updateMany({
        where: { id, familyId: ctx.familyId },
        data: { archivedAt: archived ? new Date() : null },
      });
      if (res.count === 0) throw new NotFoundError("Task not found");
    },
    client,
  );
}

export function deleteTask(userId: string, familyId: string, id: string, client?: PrismaClient) {
  return withFamily(
    userId,
    familyId,
    async (ctx) => {
      const res = await ctx.tx.task.deleteMany({ where: { id, familyId: ctx.familyId } });
      if (res.count === 0) throw new NotFoundError("Task not found");
    },
    client,
  );
}

/** The assigned person accepts a new assignment. Only the own profile; anything else is NotFound. */
export function acceptAssignment(userId: string, familyId: string, taskId: string, client?: PrismaClient) {
  return withFamily(
    userId,
    familyId,
    async (ctx) => {
      const me = await myProfileId(ctx);
      const res = await ctx.tx.taskAssignment.updateMany({
        where: { taskId, familyId: ctx.familyId, profileId: me ?? "-", state: "PENDING" },
        data: { state: "ACCEPTED" },
      });
      if (res.count === 0) throw new NotFoundError("Assignment not found");
    },
    client,
  );
}

/**
 * The assigned person declines: the assignment goes (the task is unassigned again unless others are
 * assigned) and the assigning person gets a notification via task_decline. Self-assignments have no
 * one to tell; declining one just removes it.
 */
export function declineAssignment(userId: string, familyId: string, taskId: string, client?: PrismaClient) {
  return withFamily(
    userId,
    familyId,
    async (ctx) => {
      const me = await myProfileId(ctx);
      if (!me) throw new ForbiddenError("No profile");
      const a = await ctx.tx.taskAssignment.findFirst({
        where: { taskId, familyId: ctx.familyId, profileId: me, state: "PENDING" },
        select: { assignedById: true },
      });
      if (!a) throw new NotFoundError("Assignment not found");
      await ctx.tx.taskAssignment.deleteMany({ where: { taskId, familyId: ctx.familyId, profileId: me } });
      if (a.assignedById && a.assignedById !== ctx.userId) {
        const still = await ctx.tx.familyMembership.findUnique({ where: { familyId_userId: { familyId: ctx.familyId, userId: a.assignedById } } });
        if (still) {
          await ctx.tx.taskDecline.create({
            data: { familyId: ctx.familyId, taskId, profileId: me, declinedById: ctx.userId, assignedById: a.assignedById },
          });
        }
      }
    },
    client,
  );
}
