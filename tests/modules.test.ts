import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, app, cleanup, seed, type Fixture } from "./helpers";
import { ForbiddenError, NotFoundError } from "../src/server/errors";
import { DEFAULT_FLYERS, parseFlyers } from "../src/lib/modules";
import {
  addFlyer, deleteFlyer, getFlyers, getModules, getWaste, setModule, setWasteCalendar, updateFlyer,
} from "../src/server/services/modules";
import { getDashboard } from "../src/server/services/dashboard";

let f: Fixture;
let calA = "";
let calB = "";
beforeAll(async () => {
  f = await seed();
  calA = (await admin.externalCalendar.create({ data: { familyId: f.familyA, name: "Abfall Muster", kind: "FILE", createdById: f.userA } })).id;
  calB = (await admin.externalCalendar.create({ data: { familyId: f.familyB, name: "Abfall B", kind: "FILE", createdById: f.userB } })).id;
  const day = (iso: string) => new Date(iso);
  await admin.externalCalendarEvent.createMany({
    data: [
      { familyId: f.familyA, calendarId: calA, uid: "1", instanceKey: "1", title: "Restmüll", allDay: true, startDate: day("2026-11-20"), endDate: day("2026-11-20") },
      { familyId: f.familyA, calendarId: calA, uid: "2", instanceKey: "2", title: "Bioabfall", allDay: true, startDate: day("2026-11-18"), endDate: day("2026-11-18") },
      { familyId: f.familyA, calendarId: calA, uid: "3", instanceKey: "3", title: "Altpapier (vorbei)", allDay: true, startDate: day("2026-11-01"), endDate: day("2026-11-01") },
    ],
  });
});
afterAll(async () => {
  await cleanup(f);
  await app.$disconnect();
  await admin.$disconnect();
});

const now = new Date("2026-11-15T10:00:00Z");

describe("module switches", () => {
  it("are off by default and a switched-off module is NotFound", async () => {
    expect(await getModules(f.userA, f.familyA, app)).toEqual({ flyers: false, waste: false });
    await expect(getFlyers(f.userA, f.familyA, app)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getWaste(f.userA, f.familyA, now, app)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("only admins switch, also below the service (DB trigger)", async () => {
    await expect(setModule(f.userBoth, f.familyA, "flyers", true, app)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      app.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.user_id', ${f.userBoth}, true)`;
        await tx.$executeRaw`SELECT set_config('app.family_id', ${f.familyA}, true)`;
        await tx.$executeRaw`UPDATE "family" SET "moduleWaste" = true WHERE "id" = ${f.familyA}`;
      }),
    ).rejects.toThrow(/admin/);
    expect((await admin.family.findUniqueOrThrow({ where: { id: f.familyA } })).moduleWaste).toBe(false);
  });

  it("are independent per module and per family", async () => {
    await setModule(f.userA, f.familyA, "flyers", true, app);
    expect(await getModules(f.userA, f.familyA, app)).toEqual({ flyers: true, waste: false });
    expect(await getModules(f.userB, f.familyB, app)).toEqual({ flyers: false, waste: false });
    expect(await getModules(f.userBoth, f.familyB, app)).toEqual({ flyers: false, waste: false });
  });
});

describe("flyers", () => {
  it("start with the five retailers, all https", async () => {
    const v = await getFlyers(f.userA, f.familyA, app);
    expect(v.links.map((l) => l.name)).toEqual(DEFAULT_FLYERS.map((d) => d.name));
    expect(v.links.every((l) => l.url.startsWith("https://"))).toBe(true);
    expect(v.canManage).toBe(true);
  });

  it("admins add, change, switch off and delete; members only read active links", async () => {
    await addFlyer(f.userA, f.familyA, { name: "Wochenmarkt", url: "https://markt.example.test/angebote" }, app);
    await expect(addFlyer(f.userA, f.familyA, { name: "Böse", url: "javascript:alert(1)" }, app)).rejects.toThrow();
    await expect(addFlyer(f.userA, f.familyA, { name: "Unsicher", url: "http://markt.example.test/" }, app)).rejects.toThrow();
    await expect(addFlyer(f.userBoth, f.familyA, { name: "X", url: "https://x.example.test/" }, app)).rejects.toBeInstanceOf(ForbiddenError);
    const lidl = (await getFlyers(f.userA, f.familyA, app)).links.find((l) => l.name === "Lidl")!;
    await updateFlyer(f.userA, f.familyA, lidl.id, { name: "Lidl", url: lidl.url, active: false }, app);
    const member = await getFlyers(f.userBoth, f.familyA, app);
    expect(member.canManage).toBe(false);
    expect(member.links.map((l) => l.name)).not.toContain("Lidl");
    expect(member.links.map((l) => l.name)).toContain("Wochenmarkt");
    await deleteFlyer(f.userA, f.familyA, lidl.id, app);
    await expect(deleteFlyer(f.userA, f.familyA, lidl.id, app)).rejects.toBeInstanceOf(NotFoundError);
    expect((await getFlyers(f.userA, f.familyA, app)).links).toHaveLength(5);
  });

  it("the other family sees nothing and cannot touch them", async () => {
    await expect(getFlyers(f.userB, f.familyB, app)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getFlyers(f.userNone, f.familyA, app)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("drops malformed stored entries", () => {
    expect(parseFlyers([{ id: "1", name: "a", url: "http://x.test/", active: true }, { nope: 1 }])).toEqual([]);
    expect(parseFlyers("x")).toEqual([]);
  });
});

describe("waste", () => {
  it("shows a notice without a calendar and lists future pickups in order once chosen", async () => {
    await setModule(f.userA, f.familyA, "waste", true, app);
    const empty = await getWaste(f.userA, f.familyA, now, app);
    expect(empty.calendar).toBeNull();
    expect(empty.calendars.map((c) => c.id)).toEqual([calA]);
    await setWasteCalendar(f.userA, f.familyA, calA, app);
    const v = await getWaste(f.userBoth, f.familyA, now, app);
    expect(v.calendar?.name).toBe("Abfall Muster");
    expect(v.pickups.map((p) => [p.date, p.title])).toEqual([["2026-11-18", "Bioabfall"], ["2026-11-20", "Restmüll"]]);
    expect(v.canManage).toBe(false);
    expect(v.calendars).toEqual([]);
  });

  it("refuses a foreign calendar and members", async () => {
    await expect(setWasteCalendar(f.userA, f.familyA, calB, app)).rejects.toBeInstanceOf(NotFoundError);
    await expect(setWasteCalendar(f.userBoth, f.familyA, null, app)).rejects.toBeInstanceOf(ForbiddenError);
    // the composite key also refuses it below the service
    await expect(admin.family.update({ where: { id: f.familyA }, data: { wasteCalendarId: calB } })).rejects.toThrow();
  });

  it("the dashboard shows the next pickup only with the module on", async () => {
    expect((await getDashboard(f.userA, f.familyA, now, app)).nextPickups?.map((p) => p.title)).toEqual(["Bioabfall", "Restmüll"]);
    await setModule(f.userA, f.familyA, "waste", false, app);
    expect((await getDashboard(f.userA, f.familyA, now, app)).nextPickups).toBeNull();
    await expect(getWaste(f.userA, f.familyA, now, app)).rejects.toBeInstanceOf(NotFoundError);
    await setModule(f.userA, f.familyA, "waste", true, app);
  });

  it("deleting the calendar clears the choice", async () => {
    await admin.externalCalendar.delete({ where: { id: calA } });
    expect((await admin.family.findUniqueOrThrow({ where: { id: f.familyA } })).wasteCalendarId).toBeNull();
    expect((await getWaste(f.userA, f.familyA, now, app)).calendar).toBeNull();
  });
});
