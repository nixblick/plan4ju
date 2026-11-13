import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, app, cleanup, seed, type Fixture } from "./helpers";
import { NotFoundError } from "../src/server/errors";
import { IcsError } from "../src/server/ics";
import { FetchError, type Resolver, type Transport } from "../src/server/safe-fetch";
import {
  addSubscription, createEvent, deleteCalendar, deleteEvent, getEvent, importIcsFile, listCalendars, listItems,
  MAX_CALENDARS, MANUAL_MIN_INTERVAL_MS, STALE_AFTER_MS, syncCalendar, syncStaleCalendars, updateCalendar, updateEvent,
} from "../src/server/services/calendar";
import { getDashboard } from "../src/server/services/dashboard";

let f: Fixture;
beforeAll(async () => {
  process.env.BETTER_AUTH_SECRET ??= "t".repeat(40);
  f = await seed();
});
afterAll(async () => {
  await cleanup(f);
  await app.$disconnect();
  await admin.$disconnect();
});

const NOW = new Date("2026-11-09T09:00:00Z"); // Monday 10:00 Berlin
const resolvePublic: Resolver = async () => [{ address: "93.184.216.34", family: 4 }];
const SECRET_URL = "https://calendar.example.test/private/TOKEN-9f3a7c.ics";
const ics = (...events: string[]) =>
  ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//example.test//T//DE", ...events, "END:VCALENDAR"].join("\r\n");
const vevent = (uid: string, start: string, title: string, extra = "") =>
  `BEGIN:VEVENT\r\nUID:${uid}@example.test\r\nDTSTART:${start}\r\nSUMMARY:${title}\r\n${extra}END:VEVENT`;
const serving = (text: string, counter?: { n: number }): Transport => async () => {
  if (counter) counter.n++;
  return { status: 200, body: Buffer.from(text) };
};

describe("internal events", () => {
  it("creates a timed event in the family zone and lists it with participants", async () => {
    const e = await createEvent(f.userA, f.familyA, { title: "Elternabend", startDate: "2026-11-12", startTime: "19:30", endTime: "21:00", location: "Schule", participantIds: [f.profileA] }, app);
    const items = await listItems(f.userA, f.familyA, "2026-11-09", "2026-11-15", app);
    const it = items.find((i) => i.id === e.id)!;
    expect([it.startDate, it.startTime, it.endTime, it.location, it.participantIds, it.source]).toEqual(["2026-11-12", "19:30", "21:00", "Schule", [f.profileA], "event"]);
    expect((await admin.calendarEvent.findUniqueOrThrow({ where: { id: e.id } })).startsAt!.toISOString()).toBe("2026-11-12T18:30:00.000Z"); // UTC in the database
  });

  it("all-day, multi-day events and edit round trip", async () => {
    const e = await createEvent(f.userA, f.familyA, { title: "Urlaub", allDay: true, startDate: "2026-11-13", endDate: "2026-11-15" }, app);
    const form = await getEvent(f.userA, f.familyA, e.id, app);
    expect([form.allDay, form.startDate, form.endDate, form.startTime]).toEqual([true, "2026-11-13", "2026-11-15", null]);
    await updateEvent(f.userA, f.familyA, e.id, { ...form, endDate: "2026-11-16", title: "Urlaub!" }, app);
    const items = await listItems(f.userA, f.familyA, "2026-11-16", "2026-11-16", app);
    expect(items.map((i) => i.title)).toContain("Urlaub!");
    await deleteEvent(f.userA, f.familyA, e.id, app);
    expect((await listItems(f.userA, f.familyA, "2026-11-13", "2026-11-16", app)).map((i) => i.id)).not.toContain(e.id);
  });

  it("a weekly event keeps its wall clock time across the DST change", async () => {
    const e = await createEvent(f.userA, f.familyA, { title: "Chor", startDate: "2026-10-17", startTime: "18:00", endTime: "19:00", freq: "WEEKLY", weekdays: [5] }, app);
    const items = (await listItems(f.userA, f.familyA, "2026-10-17", "2026-11-07", app)).filter((i) => i.id === e.id);
    expect(items.map((i) => i.startTime)).toEqual(["18:00", "18:00", "18:00", "18:00"]);
    await deleteEvent(f.userA, f.familyA, e.id, app);
  });

  it("validates input", async () => {
    const bad = (o: object) => createEvent(f.userA, f.familyA, { title: "x", startDate: "2026-11-12", startTime: "10:00", ...o }, app);
    await expect(bad({ title: " " })).rejects.toThrow();
    await expect(bad({ startTime: null })).rejects.toThrow(); // timed event needs a time
    await expect(bad({ endDate: "2026-11-11" })).rejects.toThrow();
    await expect(bad({ endTime: "09:00" })).rejects.toThrow();
    await expect(bad({ startDate: "2026-02-30" })).rejects.toThrow();
    await expect(bad({ freq: "DAILY", repeatUntil: "2026-11-01" })).rejects.toThrow();
  });

  it("refuses participants of another family and foreign events", async () => {
    await expect(createEvent(f.userA, f.familyA, { title: "x", startDate: "2026-11-12", startTime: "10:00", participantIds: [f.profileB] }, app)).rejects.toThrow(NotFoundError);
    await expect(getEvent(f.userA, f.familyA, f.eventB, app)).rejects.toThrow(NotFoundError);
    await expect(updateEvent(f.userA, f.familyA, f.eventB, { title: "x", startDate: "2026-11-12", startTime: "10:00" }, app)).rejects.toThrow(NotFoundError);
    await expect(deleteEvent(f.userA, f.familyA, f.eventB, app)).rejects.toThrow(NotFoundError);
    expect((await listItems(f.userA, f.familyA, "2026-11-01", "2026-11-30", app)).map((i) => i.title)).not.toContain("Geheimer Termin B");
  });
});

describe("ICS file import", () => {
  it("imports a file as an external calendar and shows its events marked as external", async () => {
    const cal = await importIcsFile(f.userA, f.familyA, { name: "Schulferien", colorIndex: 3, text: ics(vevent("f1", "20261117T080000Z", "Schulfest")) }, app, NOW);
    expect(cal).toMatchObject({ kind: "FILE", eventCount: 1, enabled: true });
    const it = (await listItems(f.userA, f.familyA, "2026-11-17", "2026-11-17", app)).find((i) => i.title === "Schulfest")!;
    expect([it.source, it.calendarName, it.colorIndex, it.startTime]).toEqual(["external", "Schulferien", 3, "09:00"]);
  });

  it("refuses a file that is no calendar and one that is too large; nothing stays behind", async () => {
    const before = (await listCalendars(f.userA, f.familyA, app)).length;
    await expect(importIcsFile(f.userA, f.familyA, { name: "x", text: "hello" }, app, NOW)).rejects.toThrow(IcsError);
    await expect(importIcsFile(f.userA, f.familyA, { name: "x", text: "A".repeat(3 * 1024 * 1024) }, app, NOW)).rejects.toThrow(FetchError);
    expect((await listCalendars(f.userA, f.familyA, app)).length).toBe(before);
  });

  it("disabled calendars disappear from the views, enabled ones come back", async () => {
    const cal = (await listCalendars(f.userA, f.familyA, app)).find((c) => c.name === "Schulferien")!;
    await updateCalendar(f.userA, f.familyA, cal.id, { enabled: false }, app);
    expect((await listItems(f.userA, f.familyA, "2026-11-17", "2026-11-17", app)).map((i) => i.title)).not.toContain("Schulfest");
    await updateCalendar(f.userA, f.familyA, cal.id, { enabled: true, name: "Schule", colorIndex: 1 }, app);
    expect((await listItems(f.userA, f.familyA, "2026-11-17", "2026-11-17", app)).find((i) => i.title === "Schulfest")).toMatchObject({ calendarName: "Schule", colorIndex: 1 });
  });

  it("another family cannot change or delete the calendar", async () => {
    await expect(updateCalendar(f.userA, f.familyA, f.calendarB, { enabled: false }, app)).rejects.toThrow(NotFoundError);
    await expect(deleteCalendar(f.userA, f.familyA, f.calendarB, app)).rejects.toThrow(NotFoundError);
    await expect(syncCalendar(f.userA, f.familyA, f.calendarB, { manual: true, client: app })).rejects.toThrow(NotFoundError);
  });
});

describe("ICS subscription", () => {
  const feed = ics(vevent("s1", "20261118T100000Z", "Müllabfuhr"), vevent("s2", "20261119T100000Z", "Sprechstunde"));
  let calId = "";

  it("is stored encrypted, fetched once and never returned to the caller", async () => {
    const counter = { n: 0 };
    const r = await addSubscription(f.userA, f.familyA, { name: "Abo", url: SECRET_URL }, { client: app, now: NOW, fetch: { resolve: resolvePublic, transport: serving(feed, counter) } });
    calId = r.id;
    expect(r.sync).toEqual({ status: "ok", events: 2 });
    expect(counter.n).toBe(1);
    const list = await listCalendars(f.userA, f.familyA, app);
    const mine = list.find((c) => c.id === calId)!;
    expect(mine).toMatchObject({ kind: "SUBSCRIPTION", eventCount: 2, lastError: null });
    expect(Object.keys(mine)).not.toContain("urlEnc");
    expect(Object.keys(mine)).not.toContain("url");
    expect(JSON.stringify(list)).not.toContain("TOKEN-9f3a7c");
    expect(JSON.stringify(list)).not.toContain("example.test");
    const row = await admin.externalCalendar.findUniqueOrThrow({ where: { id: calId } });
    expect(row.urlEnc).toBeTruthy();
    expect(JSON.stringify(row)).not.toMatch(/https|TOKEN|example/);
    expect((await listItems(f.userA, f.familyA, "2026-11-18", "2026-11-19", app)).filter((i) => i.calendarId === calId)).toHaveLength(2);
  });

  it("is not fetched again right away (manual: once a minute, lazy: once an hour)", async () => {
    const counter = { n: 0 };
    const opts = { client: app, fetch: { resolve: resolvePublic, transport: serving(feed, counter) } };
    expect(await syncCalendar(f.userA, f.familyA, calId, { ...opts, manual: true, now: new Date(NOW.getTime() + 10_000) })).toEqual({ status: "skipped" });
    expect(await syncStaleCalendars(f.userA, f.familyA, { ...opts, now: new Date(NOW.getTime() + MANUAL_MIN_INTERVAL_MS * 2) })).toBe(0);
    expect(counter.n).toBe(0);
    const later = new Date(NOW.getTime() + MANUAL_MIN_INTERVAL_MS + 1000);
    expect((await syncCalendar(f.userA, f.familyA, calId, { ...opts, manual: true, now: later })).status).toBe("ok");
    expect(counter.n).toBe(1);
  });

  it("parallel requests fetch once", async () => {
    const counter = { n: 0 };
    const slow: Transport = async () => {
      counter.n++;
      await new Promise((r) => setTimeout(r, 150));
      return { status: 200, body: Buffer.from(feed) };
    };
    const now = new Date(NOW.getTime() + STALE_AFTER_MS * 3);
    const results = await Promise.all([1, 2, 3].map(() => syncCalendar(f.userA, f.familyA, calId, { client: app, now, fetch: { resolve: resolvePublic, transport: slow } })));
    expect(counter.n).toBe(1);
    expect(results.filter((r) => r.status === "ok")).toHaveLength(1);
    expect(await admin.externalCalendarEvent.count({ where: { calendarId: calId } })).toBe(2); // replaced, not duplicated
  });

  it("an update replaces the events (changed and removed ones)", async () => {
    const now = new Date(NOW.getTime() + STALE_AFTER_MS * 6);
    const next = ics(vevent("s1", "20261118T120000Z", "Müllabfuhr (neu)"));
    await syncCalendar(f.userA, f.familyA, calId, { client: app, now, fetch: { resolve: resolvePublic, transport: serving(next) } });
    const titles = (await listItems(f.userA, f.familyA, "2026-11-18", "2026-11-19", app)).filter((i) => i.calendarId === calId).map((i) => i.title);
    expect(titles).toEqual(["Müllabfuhr (neu)"]);
  });

  it("a failing fetch keeps the old events, stores only a fixed code and never the address", async () => {
    const now = new Date(NOW.getTime() + STALE_AFTER_MS * 9);
    const boom: Transport = async () => {
      throw new Error(`connect ECONNREFUSED ${SECRET_URL}`);
    };
    const r = await syncCalendar(f.userA, f.familyA, calId, { client: app, now, fetch: { resolve: resolvePublic, transport: boom } });
    expect(r).toEqual({ status: "error", code: "netz" });
    const row = await admin.externalCalendar.findUniqueOrThrow({ where: { id: calId } });
    expect(row.lastError).toBe("netz");
    expect(JSON.stringify(row)).not.toContain("TOKEN");
    expect(await admin.externalCalendarEvent.count({ where: { calendarId: calId } })).toBe(1);
    const now2 = new Date(NOW.getTime() + STALE_AFTER_MS * 12);
    const bad = await syncCalendar(f.userA, f.familyA, calId, { client: app, now: now2, fetch: { resolve: resolvePublic, transport: serving("<html>nope</html>") } });
    expect(bad).toEqual({ status: "error", code: "datei" });
    const priv = await syncCalendar(f.userA, f.familyA, calId, {
      client: app, now: new Date(NOW.getTime() + STALE_AFTER_MS * 15), fetch: { resolve: async () => [{ address: "10.0.0.5", family: 4 }], transport: serving(feed) },
    });
    expect(priv).toEqual({ status: "error", code: "blockiert" });
  });

  it("refuses unacceptable addresses before anything is stored", async () => {
    const before = (await listCalendars(f.userA, f.familyA, app)).length;
    for (const url of ["http://calendar.example.test/a.ics", "https://127.0.0.1/a.ics", "https://169.254.169.254/latest", "https://user:pw@calendar.example.test/a.ics", "ftp://x.example.test/a.ics"]) {
      await expect(addSubscription(f.userA, f.familyA, { name: "x", url }, { client: app, now: NOW })).rejects.toThrow(FetchError);
    }
    expect((await listCalendars(f.userA, f.familyA, app)).length).toBe(before);
  });

  it("the stored address cannot be read as another row's address", async () => {
    // copying the ciphertext into another calendar row must not decrypt (AAD binds family and calendar id)
    const src = await admin.externalCalendar.findUniqueOrThrow({ where: { id: calId } });
    const other = await admin.externalCalendar.create({ data: { familyId: f.familyA, name: "Kopie", kind: "SUBSCRIPTION", urlEnc: src.urlEnc, createdById: f.userA } });
    const r = await syncCalendar(f.userA, f.familyA, other.id, { client: app, manual: true, now: NOW, fetch: { resolve: resolvePublic, transport: serving(feed) } });
    expect(r).toEqual({ status: "error", code: "netz" });
    await admin.externalCalendar.delete({ where: { id: other.id } });
  });

  it("limits the number of calendars per family", async () => {
    const have = await admin.externalCalendar.count({ where: { familyId: f.familyA } });
    for (let i = have; i < MAX_CALENDARS; i++) await importIcsFile(f.userA, f.familyA, { name: `K${i}`, text: ics() }, app, NOW);
    await expect(importIcsFile(f.userA, f.familyA, { name: "zu viel", text: ics() }, app, NOW)).rejects.toThrow();
    await expect(addSubscription(f.userA, f.familyA, { name: "zu viel", url: SECRET_URL }, { client: app, now: NOW })).rejects.toThrow();
  });
});

describe("dashboard", () => {
  it("shows internal and external events and nothing of another family in the week", async () => {
    const d = await getDashboard(f.userA, f.familyA, new Date("2026-11-12T09:00:00Z"), app);
    const titles = d.week.flatMap((w) => w.events.map((e) => e.title));
    expect(titles).toContain("Elternabend");
    expect(titles).not.toContain("Schulfest"); // 17.11. is in the next week
    const next = await getDashboard(f.userA, f.familyA, new Date("2026-11-17T09:00:00Z"), app);
    expect(next.week.flatMap((w) => w.events.map((e) => e.title))).toEqual(expect.arrayContaining(["Schulfest", "Müllabfuhr (neu)"]));
    expect(titles).not.toContain("Geheimer Termin B");
    expect(titles).not.toContain("Fremder externer Termin");
    expect(d.week.find((w) => w.iso === "2026-11-12")!.events.map((e) => e.title)).toContain("Elternabend");
  });
});
