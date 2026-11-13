import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Prisma, PrismaClient } from "@prisma/client";
import { daysBetween } from "../../lib/week";
import { expandEvent, externalItem, sortItems, type CalendarItem } from "../../lib/calendar-items";
import { localParts, zonedToUtc } from "../../lib/tz";
import { decryptSecret, encryptSecret } from "../calendar-crypto";
import { ConflictError, NotFoundError } from "../errors";
import { defaultWindow, IcsError, parseIcs } from "../ics";
import { fetchCalendarText, FetchError, parseCalendarUrl, type FetchOptions } from "../safe-fetch";
import { withFamily, type FamilyContext, type Tx } from "../tenant";
import { isoDate } from "./routines";

export const MAX_CALENDARS = 10;
export const MAX_FILE_BYTES = 2 * 1024 * 1024;
/** A subscription is fetched again when its data is older than this (lazily, when the calendar is opened). */
export const STALE_AFTER_MS = 60 * 60 * 1000;
/** Manual refresh: at most once per minute and calendar. */
export const MANUAL_MIN_INTERVAL_MS = 60 * 1000;

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const day = (s: string) => new Date(`${s}T00:00:00Z`);
const uniq = (ids: string[]) => [...new Set(ids)];

// ---- Internal events ------------------------------------------------------------------------

export const eventInput = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(4000).nullish(),
    location: z.string().trim().max(300).nullish(),
    allDay: z.boolean().default(false),
    startDate: isoDate,
    startTime: z.string().regex(HHMM).nullish(),
    endDate: isoDate.nullish(),
    endTime: z.string().regex(HHMM).nullish(),
    freq: z.enum(["DAILY", "WEEKLY", "MONTHLY"]).nullish(),
    interval: z.coerce.number().int().min(1).max(52).default(1),
    weekdays: z.array(z.coerce.number().int().min(0).max(6)).max(7).default([]),
    monthDay: z.coerce.number().int().min(1).max(31).nullish(),
    repeatUntil: isoDate.nullish(),
    participantIds: z.array(z.string()).max(20).default([]),
  })
  .superRefine((e, ctx) => {
    const endDate = e.endDate ?? e.startDate;
    if (endDate < e.startDate) ctx.addIssue({ code: "custom", path: ["endDate"], message: "End before start" });
    if (daysBetween(e.startDate, endDate) > 366) ctx.addIssue({ code: "custom", path: ["endDate"], message: "Too long" });
    if (!e.allDay) {
      if (!e.startTime) ctx.addIssue({ code: "custom", path: ["startTime"], message: "Time required" });
      else if (`${endDate}T${e.endTime ?? e.startTime}` < `${e.startDate}T${e.startTime}`) {
        ctx.addIssue({ code: "custom", path: ["endTime"], message: "End before start" });
      }
    }
    if (e.freq && e.repeatUntil && e.repeatUntil < e.startDate) {
      ctx.addIssue({ code: "custom", path: ["repeatUntil"], message: "Repeat end before start" });
    }
  });
export type EventInput = z.input<typeof eventInput>;

export interface EventForm {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  allDay: boolean;
  startDate: string;
  startTime: string | null;
  endDate: string;
  endTime: string | null;
  freq: "DAILY" | "WEEKLY" | "MONTHLY" | null;
  interval: number;
  weekdays: number[];
  monthDay: number | null;
  repeatUntil: string | null;
  participantIds: string[];
}

async function familyZone(ctx: FamilyContext): Promise<string> {
  return (await ctx.tx.family.findFirstOrThrow({ where: { id: ctx.familyId }, select: { timezone: true } })).timezone;
}

async function assertProfiles(ctx: FamilyContext, ids: string[]) {
  if (ids.length === 0) return;
  const found = await ctx.tx.familyProfile.count({ where: { id: { in: ids }, familyId: ctx.familyId } });
  if (found !== new Set(ids).size) throw new NotFoundError("Unknown profile");
}

function eventData(d: z.output<typeof eventInput>, tz: string) {
  const endDate = d.endDate ?? d.startDate;
  const shape = d.allDay
    ? { allDay: true, startDate: day(d.startDate), endDate: day(endDate), startsAt: null, endsAt: null }
    : {
        allDay: false,
        startDate: null,
        endDate: null,
        startsAt: zonedToUtc(d.startDate, d.startTime!, tz),
        endsAt: zonedToUtc(endDate, d.endTime ?? d.startTime!, tz),
      };
  return {
    title: d.title,
    description: d.description ?? null,
    location: d.location ?? null,
    ...shape,
    freq: d.freq ?? null,
    interval: d.freq ? d.interval : 1,
    weekdays: d.freq === "WEEKLY" ? uniq(d.weekdays.map(String)).map(Number) : [],
    monthDay: d.freq === "MONTHLY" ? (d.monthDay ?? null) : null,
    repeatUntil: d.freq && d.repeatUntil ? day(d.repeatUntil) : null,
  };
}

async function replaceParticipants(ctx: FamilyContext, eventId: string, ids: string[]) {
  await ctx.tx.calendarEventParticipant.deleteMany({ where: { eventId, familyId: ctx.familyId } });
  await ctx.tx.calendarEventParticipant.createMany({ data: uniq(ids).map((profileId) => ({ eventId, profileId, familyId: ctx.familyId })) });
}

export async function createEvent(userId: string, familyId: string, raw: EventInput, client?: PrismaClient) {
  const d = eventInput.parse(raw);
  return withFamily(
    userId,
    familyId,
    async (ctx) => {
      await assertProfiles(ctx, d.participantIds);
      const tz = await familyZone(ctx);
      const ev = await ctx.tx.calendarEvent.create({ data: { familyId, createdById: userId, ...eventData(d, tz) } });
      await replaceParticipants(ctx, ev.id, d.participantIds);
      return ev;
    },
    client,
  );
}

export async function updateEvent(userId: string, familyId: string, id: string, raw: EventInput, client?: PrismaClient) {
  const d = eventInput.parse(raw);
  return withFamily(
    userId,
    familyId,
    async (ctx) => {
      const own = await ctx.tx.calendarEvent.findFirst({ where: { id, familyId }, select: { id: true } });
      if (!own) throw new NotFoundError("Event not found");
      await assertProfiles(ctx, d.participantIds);
      const tz = await familyZone(ctx);
      await ctx.tx.calendarEvent.update({ where: { id }, data: eventData(d, tz) });
      await replaceParticipants(ctx, id, d.participantIds);
    },
    client,
  );
}

export function deleteEvent(userId: string, familyId: string, id: string, client?: PrismaClient) {
  return withFamily(
    userId,
    familyId,
    async (ctx) => {
      const r = await ctx.tx.calendarEvent.deleteMany({ where: { id, familyId } });
      if (r.count === 0) throw new NotFoundError("Event not found");
    },
    client,
  );
}

export function getEvent(userId: string, familyId: string, id: string, client?: PrismaClient): Promise<EventForm> {
  return withFamily(
    userId,
    familyId,
    async (ctx) => {
      const e = await ctx.tx.calendarEvent.findFirst({ where: { id, familyId }, include: { participants: { select: { profileId: true } } } });
      if (!e) throw new NotFoundError("Event not found");
      const tz = await familyZone(ctx);
      const s = e.startsAt ? localParts(e.startsAt, tz) : null;
      const en = e.endsAt ? localParts(e.endsAt, tz) : null;
      return {
        id: e.id,
        title: e.title,
        description: e.description,
        location: e.location,
        allDay: e.allDay,
        startDate: s ? s.date : iso(e.startDate!),
        startTime: s ? s.time : null,
        endDate: en ? en.date : iso(e.endDate!),
        endTime: en ? en.time : null,
        freq: e.freq,
        interval: e.interval,
        weekdays: e.weekdays,
        monthDay: e.monthDay,
        repeatUntil: e.repeatUntil ? iso(e.repeatUntil) : null,
        participantIds: e.participants.map((p) => p.profileId),
      };
    },
    client,
  );
}

// ---- Reading items ----------------------------------------------------------------------------

/** Every calendar item (internal and enabled external) that touches the local days [from, to]. */
export async function itemsBetween(ctx: FamilyContext, from: string, to: string): Promise<CalendarItem[]> {
  const tz = await familyZone(ctx);
  const lo = new Date(day(from).getTime() - 2 * 86_400_000);
  const hi = new Date(day(to).getTime() + 3 * 86_400_000);
  const [events, externals] = await Promise.all([
    ctx.tx.calendarEvent.findMany({
      where: {
        familyId: ctx.familyId,
        OR: [
          { freq: { not: null }, OR: [{ startsAt: { lte: hi } }, { startDate: { lte: day(to) } }], AND: [{ OR: [{ repeatUntil: null }, { repeatUntil: { gte: day(from) } }] }] },
          { freq: null, allDay: false, startsAt: { lte: hi }, endsAt: { gte: lo } },
          { freq: null, allDay: true, startDate: { lte: day(to) }, endDate: { gte: day(from) } },
        ],
      },
      include: { participants: { select: { profileId: true } } },
      take: 2000,
    }),
    ctx.tx.externalCalendarEvent.findMany({
      where: {
        familyId: ctx.familyId,
        calendar: { enabled: true },
        OR: [
          { allDay: false, startsAt: { lte: hi }, endsAt: { gte: lo } },
          { allDay: true, startDate: { lte: day(to) }, endDate: { gte: day(from) } },
        ],
      },
      include: { calendar: { select: { id: true, name: true, colorIndex: true } } },
      take: 5000,
    }),
  ]);
  const out: CalendarItem[] = [];
  for (const e of events) {
    out.push(
      ...expandEvent(
        {
          id: e.id, title: e.title, description: e.description, location: e.location, allDay: e.allDay,
          startsAt: e.startsAt, endsAt: e.endsAt, startDate: e.startDate ? iso(e.startDate) : null, endDate: e.endDate ? iso(e.endDate) : null,
          freq: e.freq, interval: e.interval, weekdays: e.weekdays, monthDay: e.monthDay,
          repeatUntil: e.repeatUntil ? iso(e.repeatUntil) : null, participantIds: e.participants.map((p) => p.profileId),
        },
        tz, from, to,
      ),
    );
  }
  for (const x of externals) {
    const it = externalItem(
      {
        id: x.id, title: x.title, description: x.description, location: x.location, allDay: x.allDay,
        startsAt: x.startsAt, endsAt: x.endsAt, startDate: x.startDate ? iso(x.startDate) : null, endDate: x.endDate ? iso(x.endDate) : null,
        calendarId: x.calendar.id, calendarName: x.calendar.name, colorIndex: x.calendar.colorIndex,
      },
      tz,
    );
    if (it.endDate >= from && it.startDate <= to) out.push(it);
  }
  return sortItems(out);
}

export function listItems(userId: string, familyId: string, from: string, to: string, client?: PrismaClient) {
  return withFamily(userId, familyId, (ctx) => itemsBetween(ctx, from, to), client);
}

// ---- External calendars -----------------------------------------------------------------------

/** What the UI may see of a calendar. The encrypted address (`urlEnc`) is deliberately not part of it. */
const calendarSelect = {
  id: true, name: true, colorIndex: true, kind: true, enabled: true,
  lastAttemptAt: true, lastSuccessAt: true, lastError: true, eventCount: true, truncated: true,
} as const satisfies Prisma.ExternalCalendarSelect;
export type CalendarSummary = Prisma.ExternalCalendarGetPayload<{ select: typeof calendarSelect }>;

export function listCalendars(userId: string, familyId: string, client?: PrismaClient): Promise<CalendarSummary[]> {
  return withFamily(
    userId,
    familyId,
    (ctx) => ctx.tx.externalCalendar.findMany({ where: { familyId: ctx.familyId }, select: calendarSelect, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
    client,
  );
}

const calendarMeta = z.object({
  name: z.string().trim().min(1).max(100),
  colorIndex: z.coerce.number().int().min(0).max(7).default(0),
});

type ParsedEvents = ReturnType<typeof parseIcs>;

async function replaceEvents(tx: Tx, familyId: string, calendarId: string, parsed: ParsedEvents) {
  await tx.externalCalendarEvent.deleteMany({ where: { calendarId, familyId } });
  const rows = parsed.events.map((e) => ({
    familyId, calendarId, uid: e.uid, instanceKey: e.instanceKey, title: e.title, description: e.description, location: e.location,
    allDay: e.allDay, startsAt: e.startsAt, endsAt: e.endsAt, startDate: e.startDate ? day(e.startDate) : null, endDate: e.endDate ? day(e.endDate) : null,
  }));
  for (let i = 0; i < rows.length; i += 1000) await tx.externalCalendarEvent.createMany({ data: rows.slice(i, i + 1000), skipDuplicates: true });
}

async function assertRoomForCalendar(ctx: FamilyContext) {
  // Serialize count + create per family: without the lock two parallel requests both see room and
  // together exceed MAX_CALENDARS. The lock ends with the transaction that creates the calendar.
  await ctx.tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('external_calendar'), hashtext(${ctx.familyId}))::text`;
  if ((await ctx.tx.externalCalendar.count({ where: { familyId: ctx.familyId } })) >= MAX_CALENDARS) throw new ConflictError("Too many calendars");
}

/** One-off import of an ICS file (text) as a new calendar. */
export async function importIcsFile(
  userId: string,
  familyId: string,
  raw: { name: string; colorIndex?: number; text: string },
  client?: PrismaClient,
  now: Date = new Date(),
) {
  const meta = calendarMeta.parse({ name: raw.name, colorIndex: raw.colorIndex });
  if (Buffer.byteLength(raw.text, "utf8") > MAX_FILE_BYTES) throw new FetchError("gross");
  // parse with no transaction open (a large file takes a while), then write in one
  const tz = await withFamily(userId, familyId, async (ctx) => {
    await assertRoomForCalendar(ctx);
    return familyZone(ctx);
  }, client);
  const parsed = parseIcs(raw.text, tz, defaultWindow(now));
  return withFamily(
    userId,
    familyId,
    async (ctx) => {
      await assertRoomForCalendar(ctx);
      const cal = await ctx.tx.externalCalendar.create({
        data: { familyId, createdById: userId, name: meta.name, colorIndex: meta.colorIndex, kind: "FILE", lastAttemptAt: now, lastSuccessAt: now, eventCount: parsed.events.length, truncated: parsed.truncated },
        select: calendarSelect,
      });
      await replaceEvents(ctx.tx, familyId, cal.id, parsed);
      return cal;
    },
    client,
  );
}

/** Replaces the content of an imported file calendar with a newer file. */
export async function reimportIcsFile(userId: string, familyId: string, calendarId: string, text: string, client?: PrismaClient, now: Date = new Date()) {
  if (Buffer.byteLength(text, "utf8") > MAX_FILE_BYTES) throw new FetchError("gross");
  const tz = await withFamily(userId, familyId, async (ctx) => {
    const cal = await ctx.tx.externalCalendar.findFirst({ where: { id: calendarId, familyId }, select: { id: true, kind: true } });
    if (!cal) throw new NotFoundError("Calendar not found");
    if (cal.kind !== "FILE") throw new ConflictError("Not a file calendar");
    return familyZone(ctx);
  }, client);
  const parsed = parseIcs(text, tz, defaultWindow(now));
  await withFamily(
    userId,
    familyId,
    async (ctx) => {
      await replaceEvents(ctx.tx, familyId, calendarId, parsed);
      const r = await ctx.tx.externalCalendar.updateMany({
        where: { id: calendarId, familyId },
        data: { lastAttemptAt: now, lastSuccessAt: now, lastError: null, eventCount: parsed.events.length, truncated: parsed.truncated },
      });
      if (r.count === 0) throw new NotFoundError("Calendar not found");
    },
    client,
  );
}

export type SyncResult = { status: "ok"; events: number } | { status: "skipped" } | { status: "error"; code: string };

export interface SyncOptions {
  /** Manual refresh (one per minute) instead of the lazy one (older than an hour). */
  manual?: boolean;
  now?: Date;
  fetch?: FetchOptions;
  client?: PrismaClient;
}

const storedCode = (e: unknown): string => (e instanceof FetchError ? e.stored : e instanceof IcsError ? "datei" : "netz");

/**
 * Fetches a subscription and replaces its events. Three steps on purpose: read and claim in one
 * transaction, fetch with NO transaction open (it can take seconds), write in a second one.
 * Claiming sets lastAttemptAt first, so parallel page loads do not fetch twice. The address is decrypted
 * only here, only in memory, and neither it nor any library error text is stored or logged.
 */
export async function syncCalendar(userId: string, familyId: string, calendarId: string, opts: SyncOptions = {}): Promise<SyncResult> {
  const now = opts.now ?? new Date();
  const minAge = opts.manual ? MANUAL_MIN_INTERVAL_MS : STALE_AFTER_MS;
  const claimed = await withFamily(
    userId,
    familyId,
    async (ctx) => {
      await ctx.tx.$queryRaw`SELECT id FROM external_calendar WHERE id = ${calendarId} FOR UPDATE`;
      const cal = await ctx.tx.externalCalendar.findFirst({ where: { id: calendarId, familyId }, select: { id: true, kind: true, enabled: true, urlEnc: true, lastAttemptAt: true } });
      if (!cal) throw new NotFoundError("Calendar not found");
      if (cal.kind !== "SUBSCRIPTION" || !cal.urlEnc) throw new ConflictError("Not a subscription");
      if (!opts.manual && !cal.enabled) return null;
      if (cal.lastAttemptAt && now.getTime() - cal.lastAttemptAt.getTime() < minAge) return null;
      await ctx.tx.externalCalendar.update({ where: { id: calendarId }, data: { lastAttemptAt: now } });
      return { urlEnc: cal.urlEnc, tz: await familyZone(ctx) };
    },
    opts.client,
  );
  if (!claimed) return { status: "skipped" };

  let parsed: ParsedEvents | null = null;
  let code = "";
  let url: string | null = null;
  try {
    url = decryptSecret(claimed.urlEnc, `${familyId}:${calendarId}`);
  } catch {
    code = "schluessel"; // secret rotated or ciphertext not from this row: the address must be entered again
  }
  if (url) {
    try {
      parsed = parseIcs(await fetchCalendarText(url, opts.fetch), claimed.tz, defaultWindow(now));
    } catch (e) {
      code = storedCode(e);
    }
  }

  await withFamily(
    userId,
    familyId,
    async (ctx) => {
      if (!parsed) {
        await ctx.tx.externalCalendar.updateMany({ where: { id: calendarId, familyId }, data: { lastError: code } });
        return;
      }
      await replaceEvents(ctx.tx, familyId, calendarId, parsed);
      await ctx.tx.externalCalendar.updateMany({
        where: { id: calendarId, familyId },
        data: { lastSuccessAt: now, lastError: null, eventCount: parsed.events.length, truncated: parsed.truncated },
      });
    },
    opts.client,
  );
  return parsed ? { status: "ok", events: parsed.events.length } : { status: "error", code };
}

/** Adds a subscription (read only) and fetches it once. An unacceptable address is refused before anything is stored. */
export async function addSubscription(
  userId: string,
  familyId: string,
  raw: { name: string; colorIndex?: number; url: string },
  opts: Omit<SyncOptions, "manual"> = {},
): Promise<{ id: string; sync: SyncResult }> {
  const meta = calendarMeta.parse({ name: raw.name, colorIndex: raw.colorIndex });
  const url = parseCalendarUrl(raw.url).href; // throws FetchError for http, internal addresses, user info ...
  const id = randomUUID();
  await withFamily(
    userId,
    familyId,
    async (ctx) => {
      await assertRoomForCalendar(ctx);
      await ctx.tx.externalCalendar.create({
        data: { id, familyId, createdById: userId, name: meta.name, colorIndex: meta.colorIndex, kind: "SUBSCRIPTION", urlEnc: encryptSecret(url, `${familyId}:${id}`) },
      });
    },
    opts.client,
  );
  return { id, sync: await syncCalendar(userId, familyId, id, { ...opts, manual: true }) };
}

/** Lazy refresh of every enabled subscription whose data is older than an hour. Never throws. */
export async function syncStaleCalendars(userId: string, familyId: string, opts: Omit<SyncOptions, "manual"> = {}): Promise<number> {
  const now = opts.now ?? new Date();
  let done = 0;
  try {
    const ids = await withFamily(
      userId,
      familyId,
      (ctx) =>
        ctx.tx.externalCalendar.findMany({
          where: { familyId, kind: "SUBSCRIPTION", enabled: true, OR: [{ lastAttemptAt: null }, { lastAttemptAt: { lt: new Date(now.getTime() - STALE_AFTER_MS) } }] },
          select: { id: true },
        }),
      opts.client,
    );
    for (const { id } of ids) {
      const r = await syncCalendar(userId, familyId, id, opts).catch(() => ({ status: "error" as const, code: "netz" }));
      if (r.status !== "skipped") done++;
    }
  } catch {
    /* a failing refresh must never break the page */
  }
  return done;
}

export async function updateCalendar(
  userId: string,
  familyId: string,
  id: string,
  raw: { name?: string; colorIndex?: number; enabled?: boolean },
  client?: PrismaClient,
) {
  const meta = calendarMeta.partial().parse({ name: raw.name, colorIndex: raw.colorIndex });
  return withFamily(
    userId,
    familyId,
    async (ctx) => {
      const r = await ctx.tx.externalCalendar.updateMany({
        where: { id, familyId },
        data: { ...(meta.name !== undefined ? { name: meta.name } : {}), ...(raw.colorIndex !== undefined ? { colorIndex: meta.colorIndex } : {}), ...(raw.enabled !== undefined ? { enabled: raw.enabled } : {}) },
      });
      if (r.count === 0) throw new NotFoundError("Calendar not found");
    },
    client,
  );
}

export function deleteCalendar(userId: string, familyId: string, id: string, client?: PrismaClient) {
  return withFamily(
    userId,
    familyId,
    async (ctx) => {
      const r = await ctx.tx.externalCalendar.deleteMany({ where: { id, familyId } });
      if (r.count === 0) throw new NotFoundError("Calendar not found");
    },
    client,
  );
}
