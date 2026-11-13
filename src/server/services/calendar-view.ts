import type { PrismaClient } from "@prisma/client";
import { birthdayIn, parseIso, todayIn } from "../../lib/week";
import type { CalendarItem } from "../../lib/calendar-items";
import { withFamily } from "../tenant";
import { itemsBetween } from "./calendar";
import type { DashProfile } from "./dashboard";
import { ensureOccurrences, occurrencesIn, type OccurrenceView } from "./routines";

export interface ViewTask {
  id: string;
  title: string;
  due: string;
  time: string | null;
  done: boolean;
  assigneeIds: string[];
}
export interface ViewBirthday {
  id: string;
  name: string;
  date: string;
  turns: number | null;
}
export interface CalendarViewData {
  today: string;
  timezone: string;
  profiles: DashProfile[];
  items: CalendarItem[];
  tasks: ViewTask[];
  routines: OccurrenceView[];
  birthdays: ViewBirthday[];
}

const day = (s: string) => new Date(`${s}T00:00:00Z`);

/** Everything the calendar page shows for the local days [from, to]: events, tasks with a due date, routines, birthdays. */
export function getCalendarView(userId: string, familyId: string, from: string, to: string, now: Date = new Date(), client?: PrismaClient): Promise<CalendarViewData> {
  return withFamily(
    userId,
    familyId,
    async (ctx) => {
      const family = await ctx.tx.family.findFirstOrThrow({ where: { id: familyId }, select: { timezone: true } });
      await ensureOccurrences(ctx, now);
      const [profiles, items, routines, tasks, birthdays] = await Promise.all([
        ctx.tx.familyProfile.findMany({ where: { familyId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true, displayName: true, userId: true } }),
        itemsBetween(ctx, from, to),
        occurrencesIn(ctx, from, to, false),
        ctx.tx.task.findMany({
          where: { familyId, archivedAt: null, dueDate: { gte: day(from), lte: day(to) } },
          include: { assignments: { select: { profileId: true } } },
          take: 1000,
        }),
        ctx.tx.birthday.findMany({ where: { familyId }, take: 1000 }),
      ]);
      const years = [parseIso(from).y, parseIso(to).y];
      const bdays: ViewBirthday[] = [];
      for (const b of birthdays) {
        for (let y = years[0]!; y <= years[1]!; y++) {
          const date = birthdayIn(y, b.month, b.day);
          if (date >= from && date <= to) bdays.push({ id: b.id, name: b.name, date, turns: b.birthYear ? y - b.birthYear : null });
        }
      }
      return {
        today: todayIn(family.timezone, now),
        timezone: family.timezone,
        profiles: profiles.map((p, i) => ({ id: p.id, name: p.displayName, colorIndex: i, userId: p.userId })),
        items,
        routines,
        tasks: tasks.map((t) => ({
          id: t.id,
          title: t.title,
          due: t.dueDate!.toISOString().slice(0, 10),
          time: t.dueTime,
          done: t.status === "DONE",
          assigneeIds: t.assignments.map((a) => a.profileId),
        })),
        birthdays: bdays,
      };
    },
    client,
  );
}

/** The local "today" of the family (its own time zone, not the server's). */
export function getFamilyToday(userId: string, familyId: string, now: Date = new Date(), client?: PrismaClient): Promise<string> {
  return withFamily(
    userId,
    familyId,
    async (ctx) => todayIn((await ctx.tx.family.findFirstOrThrow({ where: { id: familyId }, select: { timezone: true } })).timezone, now),
    client,
  );
}
