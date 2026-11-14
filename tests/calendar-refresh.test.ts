import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, app, cleanup, seed, type Fixture } from "./helpers";
import type { Resolver, Transport } from "../src/server/safe-fetch";
import { jobAuthorized } from "../src/server/job-auth";
import { POST } from "../src/app/api/jobs/kalender/route";
import {
  addSubscription, listCalendars, MAX_FAILURES, refreshDueCalendars, syncCalendar, syncStaleCalendars, updateCalendar,
} from "../src/server/services/calendar";

let f: Fixture;
beforeAll(async () => {
  f = await seed();
});
afterAll(async () => {
  await cleanup(f);
  await app.$disconnect();
  await admin.$disconnect();
});

const NOW = new Date("2026-11-09T09:00:00Z");
const MIN = 60_000;
const at = (minutes: number) => new Date(NOW.getTime() + minutes * MIN);
const resolvePublic: Resolver = async () => [{ address: "93.184.216.34", family: 4 }];
const feed = [
  "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//example.test//T//DE",
  "BEGIN:VEVENT", "UID:r1@example.test", "DTSTART:20261118T100000Z", "SUMMARY:Elternsprechtag", "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");
const counting = (seen: string[], body = feed): Transport => async (req) => {
  seen.push(req.url.href);
  return { status: 200, body: Buffer.from(body) };
};
const failing: Transport = async () => {
  throw new Error("down");
};

let calA = "";
let calB = "";

describe("background refresh of subscriptions", () => {
  it("refreshes due subscriptions of several families and skips the ones not yet due", async () => {
    const fetch = { resolve: resolvePublic, transport: counting([]) };
    calA = (await addSubscription(f.userA, f.familyA, { name: "Schule", url: "https://cal.example.test/a.ics" }, { client: app, now: NOW, fetch })).id;
    calB = (await addSubscription(f.userB, f.familyB, { name: "Verein", url: "https://cal.example.test/b.ics" }, { client: app, now: NOW, fetch })).id;
    await updateCalendar(f.userB, f.familyB, calB, { refreshMinutes: 360 }, app);

    const seen: string[] = [];
    const r1 = await refreshDueCalendars({ client: app, now: at(61), fetch: { resolve: resolvePublic, transport: counting(seen) } });
    expect(r1.ok).toBeGreaterThanOrEqual(1);
    expect(seen.filter((u) => u.includes("/a.ics"))).toHaveLength(1); // 60 min interval: due
    expect(seen.filter((u) => u.includes("/b.ics"))).toHaveLength(0); // 6 h interval: not yet
    const a = await admin.externalCalendar.findUniqueOrThrow({ where: { id: calA } });
    expect(a.lastSuccessAt?.toISOString()).toBe(at(61).toISOString());

    const seen2: string[] = [];
    await refreshDueCalendars({ client: app, now: at(361), fetch: { resolve: resolvePublic, transport: counting(seen2) } });
    expect(seen2.filter((u) => u.includes("/a.ics"))).toHaveLength(1);
    expect(seen2.filter((u) => u.includes("/b.ics"))).toHaveLength(1);
    expect(await admin.externalCalendarEvent.count({ where: { calendarId: calB } })).toBe(1);
  });

  it("refuses an interval that is not offered", async () => {
    await expect(updateCalendar(f.userA, f.familyA, calA, { refreshMinutes: 1 }, app)).rejects.toThrow();
    await expect(admin.$executeRaw`UPDATE external_calendar SET "refreshMinutes" = 5 WHERE id = ${calA}`).rejects.toThrow();
  });

  it("hidden calendars are not refreshed by the job", async () => {
    await updateCalendar(f.userA, f.familyA, calA, { enabled: false }, app);
    const seen: string[] = [];
    await refreshDueCalendars({ client: app, now: at(1000), fetch: { resolve: resolvePublic, transport: counting(seen) } });
    expect(seen.filter((u) => u.includes("/a.ics"))).toHaveLength(0);
    await updateCalendar(f.userA, f.familyA, calA, { enabled: true }, app);
  });

  it(`counts failures and pauses after ${MAX_FAILURES}; a paused calendar is skipped by job and page`, async () => {
    let t = 2000;
    let paused = 0;
    for (let i = 1; i <= MAX_FAILURES; i++) {
      t += 61;
      const r = await refreshDueCalendars({ client: app, now: at(t), fetch: { resolve: resolvePublic, transport: failing } });
      paused += r.paused;
      const row = await admin.externalCalendar.findUniqueOrThrow({ where: { id: calA } });
      expect(row.failCount).toBe(i);
      expect(row.pausedAt === null).toBe(i < MAX_FAILURES);
      expect(row.lastError).toBe("netz");
    }
    expect(paused).toBeGreaterThanOrEqual(1);
    expect(await admin.externalCalendarEvent.count({ where: { calendarId: calA } })).toBe(1); // old events stay

    const seen: string[] = [];
    await refreshDueCalendars({ client: app, now: at(t + 5000), fetch: { resolve: resolvePublic, transport: counting(seen) } });
    expect(await syncStaleCalendars(f.userA, f.familyA, { client: app, now: at(t + 6000), fetch: { resolve: resolvePublic, transport: counting(seen) } })).toBe(0);
    expect(seen.filter((u) => u.includes("/a.ics"))).toHaveLength(0);

    const list = await listCalendars(f.userA, f.familyA, app);
    expect(list.find((c) => c.id === calA)).toMatchObject({ failCount: MAX_FAILURES, refreshMinutes: 60 });
    expect(list.find((c) => c.id === calA)!.pausedAt).not.toBeNull();
  });

  it("a manual fetch resumes a paused calendar and resets the counter", async () => {
    const r = await syncCalendar(f.userA, f.familyA, calA, { client: app, manual: true, now: at(20000), fetch: { resolve: resolvePublic, transport: counting([]) } });
    expect(r.status).toBe("ok");
    const row = await admin.externalCalendar.findUniqueOrThrow({ where: { id: calA } });
    expect([row.failCount, row.pausedAt, row.lastError]).toEqual([0, null, null]);
  });

  it("acts as a current member when the creator has left the family", async () => {
    await admin.externalCalendar.update({ where: { id: calB }, data: { createdById: "u-gone" } });
    const seen: string[] = [];
    await refreshDueCalendars({ client: app, now: at(30000), fetch: { resolve: resolvePublic, transport: counting(seen) } });
    expect(seen.filter((u) => u.includes("/b.ics"))).toHaveLength(1);
  });

  it("the contextless function is not open to everyone and returns no address", async () => {
    const rows = await app.$queryRaw<Record<string, unknown>[]>`SELECT * FROM app_calendar_refresh_due(now()::timestamp + interval '100 days', 10)`;
    for (const row of rows) expect(Object.keys(row).sort()).toEqual(["calendar_id", "family_id", "user_id"]);
    const acl = await admin.$queryRaw<{ acl: string }[]>`SELECT coalesce(proacl::text, '') AS acl FROM pg_proc WHERE proname = 'app_calendar_refresh_due'`;
    expect(acl[0]?.acl ?? "").not.toMatch(/(^|[{,])=X/); // no EXECUTE for PUBLIC
  });
});

describe("job endpoint", () => {
  const call = (auth?: string) => POST(new Request("http://localhost/api/jobs/kalender", { method: "POST", headers: auth ? { authorization: auth } : {} }));

  it("answers 404 without JOB_TOKEN, with a short or a wrong token", async () => {
    const old = process.env.JOB_TOKEN;
    try {
      delete process.env.JOB_TOKEN;
      expect((await call("Bearer x".repeat(5))).status).toBe(404);
      process.env.JOB_TOKEN = "kurz";
      expect((await call("Bearer kurz")).status).toBe(404);
      process.env.JOB_TOKEN = "a".repeat(40);
      expect((await call(`Bearer ${"b".repeat(40)}`)).status).toBe(404);
      expect((await call()).status).toBe(404);
      expect(jobAuthorized(`Bearer ${"a".repeat(40)}`, process.env.JOB_TOKEN)).toBe(true);
    } finally {
      if (old === undefined) delete process.env.JOB_TOKEN;
      else process.env.JOB_TOKEN = old;
    }
  });
});
