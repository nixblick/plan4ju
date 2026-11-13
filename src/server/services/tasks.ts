import { z } from "zod";
import { NotFoundError } from "../errors";
import { withFamily, type FamilyContext } from "../tenant";
import type { Prisma, PrismaClient } from "@prisma/client";

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export const taskInput = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2000).nullish(),
    dueDate: z.coerce.date().nullish(),
    dueTime: z.string().regex(HHMM).nullish(),
    priority: z.enum(["LOW", "NORMAL", "HIGH"]).default("NORMAL"),
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

const include = { assignments: { select: { profileId: true } } } as const;

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
          const me = await ctx.tx.familyProfile.findFirst({ where: { familyId: ctx.familyId, userId: ctx.userId }, select: { id: true } });
          where.status = { not: "DONE" };
          where.assignments = { some: { profileId: me?.id ?? "-" } };
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
      return ctx.tx.task.findMany({
        where,
        include,
        orderBy: query.filter === "archiv" || query.filter === "erledigt" ? [{ doneAt: "desc" }, { createdAt: "desc" }] : order,
        take: 500,
      });
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
      return ctx.tx.task.create({
        data: {
          familyId: ctx.familyId,
          title: data.title,
          description: data.description || null,
          dueDate: data.dueDate ?? null,
          dueTime: data.dueDate ? data.dueTime ?? null : null,
          priority: data.priority,
          status: data.status ?? "OPEN",
          doneAt: data.status === "DONE" ? new Date() : null,
          createdById: ctx.userId,
          assignments: {
            create: [...new Set(data.assigneeIds)].map((profileId) => ({ profileId, familyId: ctx.familyId })),
          },
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
          status,
          doneAt: status === "DONE" ? current.doneAt ?? new Date() : null,
        },
      });
      if (res.count === 0) throw new NotFoundError("Task not found");
      await ctx.tx.taskAssignment.deleteMany({ where: { taskId: id, familyId: ctx.familyId } });
      await ctx.tx.taskAssignment.createMany({
        data: [...new Set(data.assigneeIds)].map((profileId) => ({ taskId: id, profileId, familyId: ctx.familyId })),
      });
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
