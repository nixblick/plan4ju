import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, app, cleanup, seed, type Fixture } from "./helpers";
import { ForbiddenError, ModuleOffError, NotFoundError } from "../src/server/errors";
import { DEFAULT_FLYERS, parseFlyers, pickupDayLabel } from "../src/lib/modules";
import { listCategories } from "../src/server/services/map";
import { listWishlists } from "../src/server/services/wishes";
import { listEntries } from "../src/server/services/mindfulness";
import { getMealWeek } from "../src/server/services/meals";
import { listRecipes } from "../src/server/services/recipes";
import { listTasks } from "../src/server/services/tasks";
import { getShoppingList, transferIngredients } from "../src/server/services/shopping";
import { listBirthdays } from "../src/server/services/birthdays";
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
const CORE_ON = { meals: true, wishes: true, map: true, mindfulness: true };

describe("module switches", () => {
  it("are off by default and a switched-off module is NotFound", async () => {
    expect(await getModules(f.userA, f.familyA, app)).toEqual({ ...CORE_ON, flyers: false, waste: false });
    await expect(getFlyers(f.userA, f.familyA, app)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getFlyers(f.userA, f.familyA, app)).rejects.toBeInstanceOf(ModuleOffError);
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
    expect(await getModules(f.userA, f.familyA, app)).toEqual({ ...CORE_ON, flyers: true, waste: false });
    expect(await getModules(f.userB, f.familyB, app)).toEqual({ ...CORE_ON, flyers: false, waste: false });
    expect(await getModules(f.userBoth, f.familyB, app)).toEqual({ ...CORE_ON, flyers: false, waste: false });
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

describe("switchable 0.4 modules and meal planning", () => {
  it("start on, only admins switch them (service and DB trigger)", async () => {
    const m = await getModules(f.userA, f.familyA, app);
    expect([m.meals, m.wishes, m.map, m.mindfulness]).toEqual([true, true, true, true]);
    await expect(setModule(f.userBoth, f.familyA, "map", false, app)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      app.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.user_id', ${f.userBoth}, true)`;
        await tx.$executeRaw`SELECT set_config('app.family_id', ${f.familyA}, true)`;
        await tx.$executeRaw`UPDATE "family" SET "moduleMindfulness" = false WHERE "id" = ${f.familyA}`;
      }),
    ).rejects.toThrow(/admin/);
    expect((await admin.family.findUniqueOrThrow({ where: { id: f.familyA } })).moduleMindfulness).toBe(true);
  });

  it("switched off: every service of the module is NotFound, core functions keep working", async () => {
    for (const k of ["meals", "wishes", "map", "mindfulness"] as const) await setModule(f.userA, f.familyA, k, false, app);
    await expect(listCategories(f.userA, f.familyA, app)).rejects.toBeInstanceOf(NotFoundError);
    await expect(listWishlists(f.userBoth, f.familyA, app)).rejects.toBeInstanceOf(NotFoundError);
    await expect(listEntries(f.userA, f.familyA, { from: "2026-11-01", to: "2026-11-30" }, app)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getMealWeek(f.userA, f.familyA, null, now, app)).rejects.toBeInstanceOf(NotFoundError);
    await expect(listRecipes(f.userA, f.familyA, app)).rejects.toBeInstanceOf(NotFoundError);
    await expect(transferIngredients(f.userA, f.familyA, { recipeId: "x", lines: [{ ingredientId: "y", quantity: null, unit: null, shopIds: [] }] }, app)).rejects.toBeInstanceOf(NotFoundError);
    // the other family is not affected
    await expect(listCategories(f.userB, f.familyB, app)).resolves.toBeDefined();
    await expect(listRecipes(f.userB, f.familyB, app)).resolves.toBeDefined();
    // core functions stay
    const d = await getDashboard(f.userA, f.familyA, now, app);
    expect(d.mealsToday).toBeUndefined();
    await expect(listTasks(f.userA, f.familyA, app)).resolves.toBeDefined();
    await expect(getShoppingList(f.userA, f.familyA, {}, app)).resolves.toBeDefined();
    await expect(listBirthdays(f.userA, f.familyA, app)).resolves.toBeDefined();
    expect((await getDashboard(f.userB, f.familyB, now, app)).mealsToday).toBeDefined();
  });

  it("switched on again, the data is back (nothing was deleted)", async () => {
    for (const k of ["meals", "wishes", "map", "mindfulness"] as const) await setModule(f.userA, f.familyA, k, true, app);
    await expect(listCategories(f.userA, f.familyA, app)).resolves.toBeDefined();
    expect((await getDashboard(f.userA, f.familyA, now, app)).mealsToday).toBeDefined();
  });
});

describe("pickup day label", () => {
  it("says Heute, Morgen or the date", () => {
    expect(pickupDayLabel("2026-11-15", "2026-11-15")).toBe("Heute");
    expect(pickupDayLabel("2026-11-16", "2026-11-15")).toBe("Morgen");
    expect(pickupDayLabel("2027-01-01", "2026-12-31")).toBe("Morgen");
    expect(pickupDayLabel("2026-11-18", "2026-11-15")).toBe("18.11.");
  });
});
