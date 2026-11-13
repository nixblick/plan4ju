import { z } from "zod";
import { NotFoundError } from "../errors";
import { withFamily, type FamilyContext } from "../tenant";
import type { PrismaClient } from "@prisma/client";

export const taskInput = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).nullish(),
  dueDate: z.coerce.date().nullish(),
  assigneeIds: z.array(z.string()).max(20).default([]),
});
export type TaskInput = z.input<typeof taskInput>;

const include = { assignments: { select: { profileId: true } } } as const;

async function assertProfiles(ctx: FamilyContext, ids: string[]) {
  if (ids.length === 0) return;
  const found = await ctx.tx.familyProfile.count({ where: { id: { in: ids }, familyId: ctx.familyId } });
  if (found !== new Set(ids).size) throw new NotFoundError("Unknown profile");
}

export function listTasks(userId: string, familyId: string, client?: PrismaClient) {
  return withFamily(
    userId,
    familyId,
    (ctx) =>
      ctx.tx.task.findMany({
        where: { familyId: ctx.familyId },
        include,
        orderBy: [{ status: "asc" }, { dueDate: "asc" }, { createdAt: "asc" }],
      }),
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
          description: data.description ?? null,
          dueDate: data.dueDate ?? null,
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
      // updateMany with familyId in the filter: a foreign id matches zero rows.
      const res = await ctx.tx.task.updateMany({
        where: { id, familyId: ctx.familyId },
        data: { title: data.title, description: data.description ?? null, dueDate: data.dueDate ?? null },
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

export function setTaskDone(userId: string, familyId: string, id: string, done: boolean, client?: PrismaClient) {
  return withFamily(
    userId,
    familyId,
    async (ctx) => {
      const res = await ctx.tx.task.updateMany({
        where: { id, familyId: ctx.familyId },
        data: { status: done ? "DONE" : "OPEN", doneAt: done ? new Date() : null },
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
