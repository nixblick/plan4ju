import { z } from "zod";
import { NotFoundError } from "../errors";
import { withFamily } from "../tenant";
import type { PrismaClient } from "@prisma/client";

export const birthdayInput = z.object({
  name: z.string().trim().min(1).max(100),
  month: z.number().int().min(1).max(12),
  day: z.number().int().min(1).max(31),
  birthYear: z.number().int().min(1900).max(2100).nullish(),
  note: z.string().trim().max(500).nullish(),
});
export type BirthdayInput = z.input<typeof birthdayInput>;

export function listBirthdays(userId: string, familyId: string, client?: PrismaClient) {
  return withFamily(
    userId,
    familyId,
    (ctx) =>
      ctx.tx.birthday.findMany({
        where: { familyId: ctx.familyId },
        orderBy: [{ month: "asc" }, { day: "asc" }],
      }),
    client,
  );
}

export async function createBirthday(userId: string, familyId: string, raw: BirthdayInput, client?: PrismaClient) {
  const d = birthdayInput.parse(raw);
  return withFamily(
    userId,
    familyId,
    (ctx) =>
      ctx.tx.birthday.create({
        data: {
          familyId: ctx.familyId,
          name: d.name,
          month: d.month,
          day: d.day,
          birthYear: d.birthYear ?? null,
          note: d.note ?? null,
          createdById: ctx.userId,
        },
      }),
    client,
  );
}

export async function updateBirthday(
  userId: string,
  familyId: string,
  id: string,
  raw: BirthdayInput,
  client?: PrismaClient,
) {
  const d = birthdayInput.parse(raw);
  return withFamily(
    userId,
    familyId,
    async (ctx) => {
      const res = await ctx.tx.birthday.updateMany({
        where: { id, familyId: ctx.familyId },
        data: { name: d.name, month: d.month, day: d.day, birthYear: d.birthYear ?? null, note: d.note ?? null },
      });
      if (res.count === 0) throw new NotFoundError("Birthday not found");
    },
    client,
  );
}

export function deleteBirthday(userId: string, familyId: string, id: string, client?: PrismaClient) {
  return withFamily(
    userId,
    familyId,
    async (ctx) => {
      const res = await ctx.tx.birthday.deleteMany({ where: { id, familyId: ctx.familyId } });
      if (res.count === 0) throw new NotFoundError("Birthday not found");
    },
    client,
  );
}
