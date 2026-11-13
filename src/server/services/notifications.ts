import { z } from "zod";
import type { NotificationKind, PrismaClient } from "@prisma/client";
import { addDays, birthdayIn, parseIso, todayIn } from "../../lib/week";
import { prisma } from "../db";
import { NotFoundError } from "../errors";
import { generateToken, hashToken } from "../tokens";
import { withFamily, type FamilyContext } from "../tenant";
import type { CalendarItem } from "../../lib/calendar-items";
import { itemsBetween } from "./calendar";
import { ensureOccurrences } from "./routines";

// In-app notifications (masterprompt section 21, docs/benachrichtigungen.md). They are generated lazily for the
// signed-in user when a page loads (and by the digest job), never for other users: RLS allows own rows only.

export const PREF_KEYS = ["tasks", "routines", "birthdays", "assignments", "emailDigest"] as const;
export type PrefKey = (typeof PREF_KEYS)[number];
export type Prefs = Record<PrefKey, boolean>;
export const DEFAULT_PREFS: Prefs = { tasks: true, routines: true, birthdays: true, assignments: true, emailDigest: false };

/** Keep read notifications this long, unread ones twice as long. */
export const KEEP_READ_DAYS = 30;
/** An assignment counts as new for this many days. */
export const ASSIGNMENT_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;
const day = (s: string) => new Date(`${s}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);

interface Draft {
  kind: NotificationKind;
  dedupeKey: string;
  title: string;
  link: string;
}

async function readPrefs(ctx: FamilyContext): Promise<Prefs> {
  const p = await ctx.tx.notificationPref.findUnique({ where: { familyId_userId: { familyId: ctx.familyId, userId: ctx.userId } } });
  return p ? { tasks: p.tasks, routines: p.routines, birthdays: p.birthdays, assignments: p.assignments, emailDigest: p.emailDigest } : { ...DEFAULT_PREFS };
}

/** Creates the notifications that are due now for the context user. Idempotent (dedupe key). */
export async function generateFor(ctx: FamilyContext, now: Date = new Date()): Promise<void> {
  const prefs = await readPrefs(ctx);
  const family = await ctx.tx.family.findFirstOrThrow({ where: { id: ctx.familyId }, select: { timezone: true } });
  const today = todayIn(family.timezone, now);
  const tomorrow = addDays(today, 1);
  const me = await ctx.tx.familyProfile.findFirst({ where: { familyId: ctx.familyId, userId: ctx.userId }, select: { id: true } });
  const drafts: Draft[] = [];

  if (me && prefs.tasks) {
    const tasks = await ctx.tx.task.findMany({
      where: { familyId: ctx.familyId, archivedAt: null, status: { not: "DONE" }, dueDate: { lte: day(today) }, assignments: { some: { profileId: me.id } } },
      select: { id: true, title: true, dueDate: true },
      take: 50,
    });
    for (const t of tasks) {
      const due = iso(t.dueDate!);
      drafts.push({
        kind: "TASK_DUE",
        dedupeKey: `task:${t.id}:${due}`,
        title: due === today ? `Heute fällig: ${t.title}` : `Überfällig: ${t.title}`,
        link: `/aufgaben/${t.id}`,
      });
    }
  }

  if (me && prefs.routines) {
    await ensureOccurrences(ctx, now);
    const occ = await ctx.tx.routineOccurrence.findMany({
      where: { familyId: ctx.familyId, date: day(today), status: "OPEN", assignments: { some: { profileId: me.id } } },
      select: { id: true, timeOfDay: true, routine: { select: { title: true } } },
      take: 50,
    });
    for (const o of occ) {
      drafts.push({
        kind: "ROUTINE_DUE",
        dedupeKey: `routine:${o.id}`,
        title: `Routine heute${o.timeOfDay ? ` um ${o.timeOfDay}` : ""}: ${o.routine.title}`,
        link: "/routinen",
      });
    }
  }

  if (prefs.birthdays) {
    const want = [today, tomorrow];
    const md = want.map((d) => parseIso(d));
    const rows = await ctx.tx.birthday.findMany({
      where: { familyId: ctx.familyId, OR: [{ month: md[0]!.m }, { month: md[1]!.m }, { month: 2, day: 29 }] },
      select: { id: true, name: true, month: true, day: true },
      take: 1000,
    });
    for (const b of rows) {
      for (const d of want) {
        // 29 February falls on 28 February in other years (birthdayIn).
        if (birthdayIn(parseIso(d).y, b.month, b.day) !== d) continue;
        const isToday = d === today;
        drafts.push({
          kind: "BIRTHDAY",
          dedupeKey: `birthday:${b.id}:${d}:${isToday ? "heute" : "morgen"}`,
          title: isToday ? `Heute hat ${b.name} Geburtstag` : `Morgen hat ${b.name} Geburtstag`,
          link: "/geburtstage",
        });
      }
    }
  }

  if (me && prefs.assignments) {
    const since = new Date(now.getTime() - ASSIGNMENT_DAYS * DAY_MS);
    const rows = await ctx.tx.taskAssignment.findMany({
      where: { familyId: ctx.familyId, profileId: me.id, createdAt: { gte: since }, task: { createdById: { not: ctx.userId }, archivedAt: null, status: { not: "DONE" } } },
      select: { task: { select: { id: true, title: true } } },
      take: 50,
    });
    for (const r of rows) {
      drafts.push({ kind: "ASSIGNED", dedupeKey: `assigned:${r.task.id}`, title: `Neu für dich: ${r.task.title}`, link: `/aufgaben/${r.task.id}` });
    }
  }

  if (drafts.length) {
    await ctx.tx.notification.createMany({
      data: drafts.map((d) => ({ ...d, title: d.title.slice(0, 300), familyId: ctx.familyId, userId: ctx.userId, createdAt: now })),
      skipDuplicates: true,
    });
  }
  // Housekeeping: old notifications go, the dedupe keys of current ones stay.
  await ctx.tx.notification.deleteMany({
    where: {
      familyId: ctx.familyId,
      userId: ctx.userId,
      OR: [
        { readAt: { lt: new Date(now.getTime() - KEEP_READ_DAYS * DAY_MS) } },
        { createdAt: { lt: new Date(now.getTime() - 2 * KEEP_READ_DAYS * DAY_MS) } },
      ],
    },
  });
}

/** Generates what is due and returns the unread count, for the bell. */
export function syncAndCount(userId: string, familyId: string, now: Date = new Date(), client?: PrismaClient): Promise<number> {
  return withFamily(
    userId,
    familyId,
    async (ctx) => {
      await generateFor(ctx, now);
      return ctx.tx.notification.count({ where: { familyId, userId, readAt: null } });
    },
    client,
  );
}

export function listNotifications(userId: string, familyId: string, client?: PrismaClient) {
  return withFamily(
    userId,
    familyId,
    (ctx) =>
      ctx.tx.notification.findMany({
        where: { familyId, userId },
        orderBy: [{ readAt: { sort: "desc", nulls: "first" } }, { createdAt: "desc" }],
        take: 100,
        select: { id: true, kind: true, title: true, link: true, createdAt: true, readAt: true },
      }),
    client,
  );
}

/** Marks one notification read and returns its (local) link. */
export function openNotification(userId: string, familyId: string, id: string, client?: PrismaClient): Promise<string> {
  return withFamily(
    userId,
    familyId,
    async (ctx) => {
      const n = await ctx.tx.notification.findFirst({ where: { id, familyId, userId }, select: { link: true, readAt: true } });
      if (!n) throw new NotFoundError("Notification not found");
      if (!n.readAt) await ctx.tx.notification.updateMany({ where: { id, familyId, userId }, data: { readAt: new Date() } });
      return n.link;
    },
    client,
  );
}

export function markAllRead(userId: string, familyId: string, client?: PrismaClient): Promise<number> {
  return withFamily(
    userId,
    familyId,
    async (ctx) => (await ctx.tx.notification.updateMany({ where: { familyId, userId, readAt: null }, data: { readAt: new Date() } })).count,
    client,
  );
}

export function getPrefs(userId: string, familyId: string, client?: PrismaClient): Promise<Prefs> {
  return withFamily(userId, familyId, readPrefs, client);
}

export const prefsInput = z.object(Object.fromEntries(PREF_KEYS.map((k) => [k, z.boolean()])) as Record<PrefKey, z.ZodBoolean>);

export function savePrefs(userId: string, familyId: string, input: Prefs, client?: PrismaClient): Promise<void> {
  const data = prefsInput.parse(input);
  return withFamily(
    userId,
    familyId,
    async (ctx) => {
      await ctx.tx.notificationPref.upsert({
        where: { familyId_userId: { familyId, userId } },
        create: { familyId, userId, ...data },
        update: data,
      });
    },
    client,
  );
}

// ---- Private calendar feed (ICS export) ----

export function getFeedInfo(userId: string, familyId: string, client?: PrismaClient) {
  return withFamily(
    userId,
    familyId,
    (ctx) => ctx.tx.calendarFeed.findFirst({ where: { familyId, userId }, select: { createdAt: true, lastUsedAt: true } }),
    client,
  );
}

/** Creates or replaces the user's feed link. The raw token is returned once; the old link stops working. */
export function createFeed(userId: string, familyId: string, client?: PrismaClient): Promise<string> {
  return withFamily(
    userId,
    familyId,
    async (ctx) => {
      const token = generateToken();
      await ctx.tx.calendarFeed.deleteMany({ where: { familyId, userId } });
      await ctx.tx.calendarFeed.create({ data: { familyId, userId, tokenHash: hashToken(token) } });
      return token;
    },
    client,
  );
}

export function revokeFeed(userId: string, familyId: string, client?: PrismaClient): Promise<void> {
  return withFamily(
    userId,
    familyId,
    async (ctx) => {
      await ctx.tx.calendarFeed.deleteMany({ where: { familyId, userId } });
    },
    client,
  );
}

/** Contextless: resolves a feed token to (user, family), or null. Only a current membership counts. */
export async function resolveFeed(token: string, client: PrismaClient = prisma): Promise<{ userId: string; familyId: string } | null> {
  if (!token || token.length < 20 || token.length > 200 || !/^[A-Za-z0-9_-]+$/.test(token)) return null;
  const rows = await client.$queryRaw<{ user_id: string; family_id: string }[]>`SELECT * FROM app_calendar_feed_lookup(${hashToken(token)})`;
  const r = rows[0];
  return r ? { userId: r.user_id, familyId: r.family_id } : null;
}

/** Contextless: claims the daily digests that are due for `dayIso` (marks them sent first, so a rerun sends nothing twice). */
export async function claimDigests(dayIso: string, client: PrismaClient = prisma): Promise<{ userId: string; familyId: string }[]> {
  const rows = await client.$queryRaw<{ user_id: string; family_id: string }[]>`SELECT * FROM app_digest_claim(${day(dayIso)}::date)`;
  return rows.map((r) => ({ userId: r.user_id, familyId: r.family_id }));
}

// ---- Feed content and daily digest ----

/** Feed window: 30 days back, one year ahead (family time zone). */
export const FEED_DAYS_BACK = 30;
export const FEED_DAYS_AHEAD = 365;

export interface FeedData {
  familyName: string;
  tz: string;
  items: CalendarItem[];
  birthdays: { id: string; name: string; date: string }[];
}

/** The family's own events and birthdays for the feed. External calendars are not re-published. */
export function feedData(userId: string, familyId: string, now: Date = new Date(), client?: PrismaClient): Promise<FeedData> {
  return withFamily(
    userId,
    familyId,
    async (ctx) => {
      const family = await ctx.tx.family.findFirstOrThrow({ where: { id: familyId }, select: { name: true, timezone: true } });
      const today = todayIn(family.timezone, now);
      const from = addDays(today, -FEED_DAYS_BACK);
      const to = addDays(today, FEED_DAYS_AHEAD);
      const items = (await itemsBetween(ctx, from, to)).filter((i) => i.source === "event");
      const rows = await ctx.tx.birthday.findMany({ where: { familyId }, select: { id: true, name: true, month: true, day: true }, take: 1000 });
      const birthdays: FeedData["birthdays"] = [];
      for (const b of rows) {
        for (let y = parseIso(from).y; y <= parseIso(to).y; y++) {
          const date = birthdayIn(y, b.month, b.day);
          if (date >= from && date <= to) birthdays.push({ id: b.id, name: b.name, date });
        }
      }
      return { familyName: family.name, tz: family.timezone, items, birthdays };
    },
    client,
  );
}

export interface DigestContent {
  email: string;
  familyName: string;
  titles: string[];
}

/** Generates and collects the unread notifications of the last two days for one user's digest. */
export function digestFor(userId: string, familyId: string, now: Date = new Date(), client?: PrismaClient): Promise<DigestContent | null> {
  return withFamily(
    userId,
    familyId,
    async (ctx) => {
      await generateFor(ctx, now);
      const prefs = await readPrefs(ctx);
      if (!prefs.emailDigest) return null;
      const rows = await ctx.tx.notification.findMany({
        where: { familyId, userId, readAt: null, createdAt: { gte: new Date(now.getTime() - 2 * DAY_MS) } },
        orderBy: { createdAt: "asc" },
        take: 50,
        select: { title: true },
      });
      if (!rows.length) return null;
      const [user, family] = await Promise.all([
        ctx.tx.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } }),
        ctx.tx.family.findFirstOrThrow({ where: { id: familyId }, select: { name: true } }),
      ]);
      return { email: user.email, familyName: family.name, titles: rows.map((r) => r.title) };
    },
    client,
  );
}
