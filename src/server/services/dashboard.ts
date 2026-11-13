import type { PrismaClient } from "@prisma/client";
import { addDays, daysBetween, nextBirthday, todayIn, weekOf } from "../../lib/week";
import { itemsOnDay, type CalendarItem } from "../../lib/calendar-items";
import { withFamily } from "../tenant";
import { itemsBetween } from "./calendar";
import { mealsOn, type MealView } from "./meals";
import { ensureOccurrences, occurrencesIn, type OccurrenceView } from "./routines";

export interface DashProfile {
  id: string;
  name: string;
  colorIndex: number;
  userId: string | null;
}
export interface DashTask {
  id: string;
  title: string;
  due: string | null;
  done: boolean;
  assigneeIds: string[];
}
export type DashOccurrence = OccurrenceView;
export interface DashBirthday {
  id: string;
  name: string;
  month: number;
  day: number;
  birthYear: number | null;
}
export interface DashBirthdayNext extends DashBirthday {
  date: string;
  inDays: number;
  turns: number | null;
}
export interface DashboardData {
  familyName: string;
  timezone: string;
  today: string;
  profiles: DashProfile[];
  myProfileId: string | null;
  week: { iso: string; isToday: boolean; tasks: DashTask[]; birthdays: DashBirthdayNext[]; routines: DashOccurrence[]; events: CalendarItem[] }[];
  routinesToday: DashOccurrence[];
  eventsToday: CalendarItem[];
  mine: DashTask[];
  dueToday: DashTask[];
  overdue: DashTask[];
  nextBirthdays: DashBirthdayNext[];
  /** Planned meals of today in slot order (filled by getDashboard). */
  mealsToday?: (MealView & { slotName: string })[];
}

export interface RawDashboard {
  familyName: string;
  timezone: string;
  profiles: { id: string; displayName: string; userId: string | null }[]; // creation order
  tasks: DashTask[];
  birthdays: DashBirthday[];
  /** Routine occurrences of the displayed week (skipped ones may be included, they are hidden here). */
  occurrences?: DashOccurrence[];
  /** Calendar items (internal and external) touching the displayed week. */
  events?: CalendarItem[];
}

/** Pure: shapes the raw family data into what the dashboard shows. */
export function buildDashboard(raw: RawDashboard, userId: string, now: Date = new Date()): DashboardData {
  const today = todayIn(raw.timezone, now);
  const days = weekOf(today);
  const profiles = raw.profiles.map((p, i) => ({ id: p.id, name: p.displayName, colorIndex: i, userId: p.userId }));
  const myProfileId = profiles.find((p) => p.userId === userId)?.id ?? null;
  const open = raw.tasks.filter((t) => !t.done);
  const byDue = (a: DashTask, b: DashTask) => (a.due ?? "9") .localeCompare(b.due ?? "9") || a.title.localeCompare(b.title, "de");
  const occurrences = (raw.occurrences ?? []).filter((o) => o.status !== "SKIPPED");
  const upcoming = raw.birthdays
    .map((b) => {
      const date = nextBirthday(b.month, b.day, today);
      return { ...b, date, inDays: daysBetween(today, date), turns: b.birthYear ? Number(date.slice(0, 4)) - b.birthYear : null };
    })
    .sort((a, b) => a.inDays - b.inDays || a.name.localeCompare(b.name, "de"));
  return {
    familyName: raw.familyName,
    timezone: raw.timezone,
    today,
    profiles,
    myProfileId,
    week: days.map((iso) => ({
      iso,
      isToday: iso === today,
      tasks: raw.tasks.filter((t) => t.due === iso).sort((a, b) => Number(a.done) - Number(b.done) || a.title.localeCompare(b.title, "de")),
      birthdays: upcoming.filter((b) => b.date === iso),
      routines: occurrences.filter((o) => o.date === iso),
      events: itemsOnDay(raw.events ?? [], iso),
    })),
    routinesToday: occurrences.filter((o) => o.date === today),
    eventsToday: itemsOnDay(raw.events ?? [], today),
    mine: myProfileId ? open.filter((t) => t.assigneeIds.includes(myProfileId)).sort(byDue) : [],
    dueToday: open.filter((t) => t.due === today).sort(byDue),
    overdue: open.filter((t) => t.due !== null && t.due < today).sort(byDue),
    nextBirthdays: upcoming.slice(0, 4),
  };
}

export function getDashboard(userId: string, familyId: string, now: Date = new Date(), client?: PrismaClient) {
  return withFamily(
    userId,
    familyId,
    async (ctx) => {
      const family = await ctx.tx.family.findFirstOrThrow({ where: { id: familyId }, select: { name: true, timezone: true } });
      const today = todayIn(family.timezone, now);
      await ensureOccurrences(ctx, now);
      const weekDays = weekOf(today);
      const from = new Date(addDays(today, -366)); // older overdue tasks still matter, but bound the query
      const occurrences = await occurrencesIn(ctx, weekDays[0]!, weekDays[6]!, false);
      const events = await itemsBetween(ctx, weekDays[0]!, weekDays[6]!);
      const [profiles, tasks, birthdays] = await Promise.all([
        ctx.tx.familyProfile.findMany({
          where: { familyId },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          select: { id: true, displayName: true, userId: true },
        }),
        ctx.tx.task.findMany({
          where: { familyId, archivedAt: null, OR: [{ status: { not: "DONE" } }, { dueDate: { gte: from } }] },
          include: { assignments: { select: { profileId: true } } },
          take: 2000,
        }),
        ctx.tx.birthday.findMany({ where: { familyId }, take: 1000 }),
      ]);
      const [slots, meals] = await Promise.all([
        ctx.tx.mealSlot.findMany({ where: { familyId }, orderBy: [{ position: "asc" }, { name: "asc" }], select: { id: true, name: true } }),
        mealsOn(ctx, today),
      ]);
      const mealsToday = slots.flatMap((sl) => meals.filter((m) => m.slotId === sl.id).map((m) => ({ ...m, slotName: sl.name })));
      const built = buildDashboard(
        {
          familyName: family.name,
          timezone: family.timezone,
          profiles,
          tasks: tasks.map((t) => ({
            id: t.id,
            title: t.title,
            due: t.dueDate ? t.dueDate.toISOString().slice(0, 10) : null,
            done: t.status === "DONE",
            assigneeIds: t.assignments.map((a) => a.profileId),
          })),
          birthdays: birthdays.map((b) => ({ id: b.id, name: b.name, month: b.month, day: b.day, birthYear: b.birthYear })),
          occurrences,
          events,
        },
        userId,
        now,
      );
      return { ...built, mealsToday };
    },
    client,
  );
}
