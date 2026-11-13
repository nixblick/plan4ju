import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, app, cleanup, seed, type Fixture } from "./helpers";
import { ForbiddenError, NotFoundError } from "../src/server/errors";
import { buildIcs, escapeText, fold } from "../src/lib/ics-export";
import { runDigest } from "../src/server/digest";
import { jobAuthorized } from "../src/server/job-auth";
import {
  claimDigests, createFeed, digestFor, feedData, getFeedInfo, getPrefs, listNotifications, markAllRead, openNotification,
  resolveFeed, revokeFeed, savePrefs, syncAndCount, DEFAULT_PREFS,
} from "../src/server/services/notifications";

// Family A: userA (OWNER) assigns work to userBoth. Berlin 09:00 on Monday 16.11.2026.
const NOW = new Date("2026-11-16T08:00:00Z");
let f: Fixture;
let profileBoth = "";
let taskDue = "";
let taskOwn = "";

beforeAll(async () => {
  f = await seed();
  profileBoth = (await admin.familyProfile.create({ data: { familyId: f.familyA, displayName: "Bodo Muster", userId: f.userBoth } })).id;
  taskDue = (await admin.task.create({
    data: { familyId: f.familyA, title: "Fenster putzen", dueDate: new Date("2026-11-16"), createdById: f.userA, assignments: { create: { profileId: profileBoth, familyId: f.familyA, createdAt: new Date("2026-11-15T10:00:00Z") } } },
  })).id;
  taskOwn = (await admin.task.create({
    data: { familyId: f.familyA, title: "Eigene Notiz", dueDate: new Date("2026-11-10"), createdById: f.userBoth, assignments: { create: { profileId: profileBoth, familyId: f.familyA, createdAt: new Date("2026-11-15T10:00:00Z") } } },
  })).id;
  await admin.task.create({ data: { familyId: f.familyA, title: "Erledigt", dueDate: new Date("2026-11-16"), status: "DONE", createdById: f.userA, assignments: { create: { profileId: profileBoth, familyId: f.familyA } } } });
  await admin.birthday.create({ data: { familyId: f.familyA, name: "Opa Muster", month: 11, day: 17, createdById: f.userA } });
  await admin.birthday.create({ data: { familyId: f.familyA, name: "Tante Muster", month: 11, day: 16, createdById: f.userA } });
  await admin.birthday.create({ data: { familyId: f.familyA, name: "Später Muster", month: 11, day: 20, createdById: f.userA } });
  const r = await admin.routine.create({ data: { familyId: f.familyA, title: "Blumen gießen", startDate: new Date("2026-11-16"), generatedUntil: new Date("2027-06-01"), createdById: f.userA } });
  await admin.routineOccurrence.create({ data: { familyId: f.familyA, routineId: r.id, date: new Date("2026-11-16"), timeOfDay: "18:00", assignments: { create: { profileId: profileBoth, familyId: f.familyA } } } });
  await admin.calendarEvent.create({ data: { familyId: f.familyA, title: "Elternabend, Raum 3", location: "Schule", startsAt: new Date("2026-11-18T17:00:00Z"), endsAt: new Date("2026-11-18T18:30:00Z"), createdById: f.userA } });
});
afterAll(async () => {
  await cleanup(f);
  await app.$disconnect();
  await admin.$disconnect();
});

describe("generation", () => {
  it("creates due task, overdue task, routine, birthdays today/tomorrow and the new assignment, once", async () => {
    const n = await syncAndCount(f.userBoth, f.familyA, NOW, app);
    const again = await syncAndCount(f.userBoth, f.familyA, NOW, app);
    expect(again).toBe(n);
    const titles = (await listNotifications(f.userBoth, f.familyA, app)).map((x) => x.title).sort();
    expect(titles).toEqual([
      "Heute fällig: Fenster putzen",
      "Heute hat Tante Muster Geburtstag",
      "Morgen hat Opa Muster Geburtstag",
      "Neu für dich: Fenster putzen",
      "Routine heute um 18:00: Blumen gießen",
      "Überfällig: Eigene Notiz",
    ]);
    expect(n).toBe(6);
  });

  it("old assignments do not count as new, own tasks never", async () => {
    const later = new Date("2026-11-25T08:00:00Z");
    await syncAndCount(f.userBoth, f.familyA, later, app);
    const titles = (await listNotifications(f.userBoth, f.familyA, app)).map((x) => x.title);
    expect(titles.filter((t) => t.startsWith("Neu für dich"))).toEqual(["Neu für dich: Fenster putzen"]);
    expect(titles).not.toContain("Neu für dich: Eigene Notiz");
  });

  it("an assignment older than 7 days is not new", async () => {
    const old = await admin.task.create({
      data: { familyId: f.familyA, title: "Alte Zuweisung", createdById: f.userA, assignments: { create: { profileId: profileBoth, familyId: f.familyA, createdAt: new Date("2026-11-08T08:00:00Z") } } },
    });
    await syncAndCount(f.userBoth, f.familyA, NOW, app);
    expect((await listNotifications(f.userBoth, f.familyA, app)).map((x) => x.title)).not.toContain("Neu für dich: Alte Zuweisung");
    await admin.task.delete({ where: { id: old.id } });
  });

  it("respects the per-user settings", async () => {
    expect(await getPrefs(f.userA, f.familyA, app)).toEqual(DEFAULT_PREFS);
    await savePrefs(f.userA, f.familyA, { ...DEFAULT_PREFS, birthdays: false }, app);
    await syncAndCount(f.userA, f.familyA, NOW, app);
    // userA has no assigned work and birthdays switched off: nothing.
    expect(await listNotifications(f.userA, f.familyA, app)).toHaveLength(0);
    // userBoth's settings are untouched.
    expect((await getPrefs(f.userBoth, f.familyA, app)).birthdays).toBe(true);
  });

  it("opening marks read and returns a local link; mark all read", async () => {
    const list = await listNotifications(f.userBoth, f.familyA, app);
    const task = list.find((x) => x.title === "Heute fällig: Fenster putzen")!;
    expect(await openNotification(f.userBoth, f.familyA, task.id, app)).toBe(`/aufgaben/${taskDue}`);
    expect((await listNotifications(f.userBoth, f.familyA, app)).find((x) => x.id === task.id)!.readAt).not.toBeNull();
    await markAllRead(f.userBoth, f.familyA, app);
    expect(await syncAndCount(f.userBoth, f.familyA, NOW, app)).toBe(0);
    expect(taskOwn).toBeTruthy();
  });
});

describe("isolation", () => {
  it("nobody else sees or opens a user's notifications, not even the owner", async () => {
    const mine = await listNotifications(f.userBoth, f.familyA, app);
    expect(mine.length).toBeGreaterThan(0);
    await expect(openNotification(f.userA, f.familyA, mine[0]!.id, app)).rejects.toBeInstanceOf(NotFoundError);
    await expect(openNotification(f.userBoth, f.familyB, mine[0]!.id, app)).rejects.toBeInstanceOf(NotFoundError);
    await expect(listNotifications(f.userB, f.familyA, app)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("RLS: no rows of others visible, no insert for another user, prefs and feeds are private", async () => {
    await createFeed(f.userBoth, f.familyA, app);
    await app.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.user_id', ${f.userA}, true)`;
      await tx.$executeRaw`SELECT set_config('app.family_id', ${f.familyA}, true)`;
      expect(await tx.notification.findMany({ where: { userId: f.userBoth } })).toHaveLength(0);
      expect(await tx.notificationPref.findMany({ where: { userId: f.userBoth } })).toHaveLength(0);
      expect(await tx.calendarFeed.findMany({ where: { userId: f.userBoth } })).toHaveLength(0);
      expect((await tx.notification.updateMany({ where: { userId: f.userBoth }, data: { readAt: null } })).count).toBe(0);
      expect((await tx.calendarFeed.deleteMany({ where: { userId: f.userBoth } })).count).toBe(0);
    });
    await expect(
      app.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.user_id', ${f.userA}, true)`;
        await tx.$executeRaw`SELECT set_config('app.family_id', ${f.familyA}, true)`;
        await tx.notification.create({ data: { familyId: f.familyA, userId: f.userBoth, kind: "ASSIGNED", dedupeKey: "x", title: "Falsch", link: "/" } });
      }),
    ).rejects.toThrow();
    // Foreign family as own user: blocked by RLS (and by the membership FK).
    await expect(
      app.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.user_id', ${f.userA}, true)`;
        await tx.$executeRaw`SELECT set_config('app.family_id', ${f.familyA}, true)`;
        await tx.notification.create({ data: { familyId: f.familyB, userId: f.userA, kind: "ASSIGNED", dedupeKey: "y", title: "Falsch", link: "/" } });
      }),
    ).rejects.toThrow();
  });

  it("links must be local", async () => {
    await expect(
      admin.notification.create({ data: { familyId: f.familyA, userId: f.userA, kind: "ASSIGNED", dedupeKey: "z", title: "x", link: "https://example.test/" } }),
    ).rejects.toThrow();
  });
});

describe("calendar feed", () => {
  it("token resolves to its user and family only, is stored hashed, replaced and revocable", async () => {
    const t1 = await createFeed(f.userA, f.familyA, app);
    expect(await resolveFeed(t1, app)).toEqual({ userId: f.userA, familyId: f.familyA });
    const stored = await admin.calendarFeed.findFirstOrThrow({ where: { userId: f.userA, familyId: f.familyA } });
    expect(stored.tokenHash).not.toContain(t1);
    expect(stored.lastUsedAt).not.toBeNull();
    const t2 = await createFeed(f.userA, f.familyA, app);
    expect(await resolveFeed(t1, app)).toBeNull();
    expect(await resolveFeed(t2, app)).not.toBeNull();
    expect(await getFeedInfo(f.userA, f.familyA, app)).not.toBeNull();
    await revokeFeed(f.userA, f.familyA, app);
    expect(await resolveFeed(t2, app)).toBeNull();
    expect(await resolveFeed("kurz", app)).toBeNull();
    expect(await resolveFeed("a".repeat(43), app)).toBeNull();
  });

  it("stops working when the member leaves the family", async () => {
    await admin.familyMembership.create({ data: { familyId: f.familyB, userId: f.userNone } });
    const t = await createFeed(f.userNone, f.familyB, app);
    expect(await resolveFeed(t, app)).not.toBeNull();
    await admin.familyMembership.delete({ where: { familyId_userId: { familyId: f.familyB, userId: f.userNone } } });
    expect(await resolveFeed(t, app)).toBeNull();
  });

  it("contains the family's events and birthdays, nothing of other families", async () => {
    const d = await feedData(f.userA, f.familyA, NOW, app);
    const ics = buildIcs({ name: `Plan4JU ${d.familyName}`, tz: d.tz, items: d.items, birthdays: d.birthdays, host: "example.test", now: NOW });
    expect(ics).toContain("SUMMARY:Elternabend\\, Raum 3");
    expect(ics).toContain("DTSTART:20261118T170000Z");
    expect(ics).toContain("DTEND:20261118T183000Z");
    expect(ics).toContain("SUMMARY:Geburtstag: Opa Muster");
    expect(ics).toContain("DTSTART;VALUE=DATE:20261117");
    expect(ics).not.toContain("Geheimer Termin B");
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });
});

describe("ics writer", () => {
  it("escapes and folds", () => {
    expect(escapeText("a;b,c\\d\ne")).toBe("a\;b\\,c\\\\d\\ne");
    const long = `SUMMARY:${"ä".repeat(60)}`;
    const lines = fold(long).split("\r\n");
    expect(lines.length).toBeGreaterThan(1);
    for (const l of lines) expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75);
    expect(lines.map((l, i) => (i ? l.slice(1) : l)).join("")).toBe(long);
  });
  it("all-day events end exclusive", () => {
    const ics = buildIcs({
      name: "x", tz: "Europe/Berlin", host: "h", birthdays: [],
      items: [{ key: "k", source: "event", id: "e", title: "Ferien", description: null, location: null, allDay: true, startDate: "2026-12-21", endDate: "2026-12-23", startTime: null, endTime: null, participantIds: [], repeats: false, calendarId: null, calendarName: null, colorIndex: null }],
    });
    expect(ics).toContain("DTSTART;VALUE=DATE:20261221");
    expect(ics).toContain("DTEND;VALUE=DATE:20261224");
  });
});

describe("daily digest", () => {
  it("is off by default, sends once per day when on, only to opted-in users", async () => {
    expect(await digestFor(f.userBoth, f.familyA, NOW, app)).toBeNull();
    // Fresh unread items for userBoth on another day.
    const day2 = new Date("2026-11-17T05:00:00Z");
    await savePrefs(f.userBoth, f.familyA, { ...DEFAULT_PREFS, emailDigest: true }, app);
    const sent: { to: string; subject: string; text: string }[] = [];
    const r1 = await runDigest(day2, app, async (m) => { sent.push(m); });
    const mine = sent.filter((m) => m.to.startsWith("both-"));
    expect(mine).toHaveLength(1);
    expect(mine[0]!.text).toContain("Heute hat Opa Muster Geburtstag");
    expect(mine[0]!.text).toContain("/benachrichtigungen/einstellungen");
    expect(r1.failed).toBe(0);
    await runDigest(day2, app, async (m) => { sent.push(m); });
    expect(sent.filter((m) => m.to.startsWith("both-"))).toHaveLength(1);
    expect(sent.some((m) => m.to.startsWith("a-"))).toBe(false);
    expect((await claimDigests("2026-11-17", app)).some((c) => c.userId === f.userBoth)).toBe(false);
  });

  it("job endpoint needs the configured token", () => {
    const tok = "x".repeat(40);
    expect(jobAuthorized(`Bearer ${tok}`, tok)).toBe(true);
    expect(jobAuthorized(`Bearer ${tok}y`, tok)).toBe(false);
    expect(jobAuthorized(null, tok)).toBe(false);
    expect(jobAuthorized(`Bearer ${tok}`, undefined)).toBe(false);
    expect(jobAuthorized("Bearer kurz", "kurz")).toBe(false);
  });
});
