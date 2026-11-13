import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, app, cleanup, seed, type Fixture } from "./helpers";
import { ConflictError, ForbiddenError, NotFoundError } from "../src/server/errors";
import { DEFAULT_CATEGORIES, isExpired, parseCoord, tileOrigin } from "../src/lib/map";
import { buildCsp } from "../src/proxy";
import {
  createCategory, createPoi, deletePoi, getPoi, listCategories, listPoiCreators, listPois, movePoi, updateCategory, updatePoi,
} from "../src/server/services/map";

let f: Fixture;
let catA = "";
let catB = "";
let poiB = "";
beforeAll(async () => {
  f = await seed();
  await admin.familyProfile.create({ data: { familyId: f.familyA, displayName: "Bodo Muster", userId: f.userBoth } });
  catB = (await admin.mapCategory.create({ data: { familyId: f.familyB, name: "Geheim B", icon: "pin" } })).id;
  poiB = (await admin.poi.create({ data: { familyId: f.familyB, categoryId: catB, name: "Ort B", lat: 50, lng: 8, createdById: f.userB } })).id;
});
afterAll(async () => {
  await cleanup(f);
  await app.$disconnect();
  await admin.$disconnect();
});

function raw<T>(familyId: string, userId: string, fn: (tx: Parameters<Parameters<typeof app.$transaction>[0]>[0]) => Promise<T>) {
  return app.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.user_id', ${userId}, true)`;
    await tx.$executeRaw`SELECT set_config('app.family_id', ${familyId}, true)`;
    return fn(tx);
  });
}

const point = (name: string, extra: Record<string, unknown> = {}) => ({ name, categoryId: catA, lat: 50.1, lng: 8.6, ...extra });

describe("helpers", () => {
  it("derives the tile origin for the CSP", () => {
    expect(tileOrigin("https://tile.openstreetmap.org/{z}/{x}/{y}.png")).toBe("https://tile.openstreetmap.org");
    expect(tileOrigin("https://{s}.tiles.example.test/{z}/{x}/{y}.png")).toBe("https://*.tiles.example.test");
    expect(tileOrigin("http://tile.example.test/{z}/{x}/{y}.png")).toBeNull();
    expect(tileOrigin("https://tile.example.test 'unsafe-inline'/x")).toBeNull();
    expect(buildCsp(false, undefined, "https://tile.openstreetmap.org")).toContain("img-src 'self' data: https://tile.openstreetmap.org");
  });

  it("parses coordinates and expiry", () => {
    expect(parseCoord("50,1234", "lat")).toBe(50.1234);
    expect(parseCoord("-8.5", "lng")).toBe(-8.5);
    expect(parseCoord("91", "lat")).toBeNaN();
    expect(parseCoord("abc", "lng")).toBeNaN();
    expect(isExpired(null, "2026-11-20")).toBe(false);
    expect(isExpired("2026-11-19", "2026-11-20")).toBe(true);
    expect(isExpired("2026-11-20", "2026-11-20")).toBe(false);
  });
});

describe("categories", () => {
  it("creates the starter categories once per family", async () => {
    const cats = await listCategories(f.userA, f.familyA, app);
    expect(cats.map((c) => c.name).sort()).toEqual(DEFAULT_CATEGORIES.map((c) => c.name).sort());
    expect(await listCategories(f.userA, f.familyA, app)).toHaveLength(DEFAULT_CATEGORIES.length);
    catA = cats.find((c) => c.name === "Spielplatz")!.id;
  });

  it("only ADMIN and up manage categories; icons come from the built-in set", async () => {
    await expect(createCategory(f.userBoth, f.familyA, { name: "Badesee", icon: "welle" }, app)).rejects.toThrow(ForbiddenError);
    await expect(createCategory(f.userA, f.familyA, { name: "Böse", icon: "<svg onload=x>" as never }, app)).rejects.toThrow();
    await expect(createCategory(f.userA, f.familyA, { name: "Bunt", icon: "pin", color: "red" }, app)).rejects.toThrow();
    const { id } = await createCategory(f.userA, f.familyA, { name: "Badesee", icon: "welle", color: "#0EA5E9" }, app);
    await expect(createCategory(f.userA, f.familyA, { name: "badesee", icon: "pin" }, app)).rejects.toThrow(ConflictError);
    await updateCategory(f.userA, f.familyA, id, { name: "Badesee", icon: "welle", active: false }, app);
    const c = (await listCategories(f.userA, f.familyA, app)).find((x) => x.id === id)!;
    expect([c.active, c.color]).toEqual([false, "#c2410c"]);
    await expect(createPoi(f.userA, f.familyA, point("See", { categoryId: id }), app)).rejects.toThrow(ConflictError);
    await expect(updateCategory(f.userA, f.familyA, catB, { name: "x", icon: "pin" }, app)).rejects.toThrow(NotFoundError);
  });
});

describe("points", () => {
  it("validates input and refuses foreign categories", async () => {
    await expect(createPoi(f.userA, f.familyA, point("x", { lat: 91 }), app)).rejects.toThrow();
    await expect(createPoi(f.userA, f.familyA, point("x", { url: "http://example.org" }), app)).rejects.toThrow();
    await expect(createPoi(f.userA, f.familyA, point("x", { rating: 6 }), app)).rejects.toThrow();
    await expect(createPoi(f.userA, f.familyA, point("x", { startDate: "2026-11-20", endDate: "2026-11-19" }), app)).rejects.toThrow();
    await expect(createPoi(f.userA, f.familyA, point("x", { categoryId: catB }), app)).rejects.toThrow(NotFoundError);
  });

  it("is shared within the family, filtered by category, creator and name", async () => {
    const cafe = (await listCategories(f.userA, f.familyA, app)).find((c) => c.name === "Café")!.id;
    const a = await createPoi(f.userA, f.familyA, point("Spielplatz am Bach", { rating: 4, url: "https://example.org/a" }), app);
    await createPoi(f.userBoth, f.familyA, point("Eiscafé Muster", { categoryId: cafe }), app);
    const all = await listPois(f.userBoth, f.familyA, {}, app);
    expect(all.map((p) => p.name).sort()).toEqual(["Eiscafé Muster", "Spielplatz am Bach"]);
    expect(all.find((p) => p.id === a.id)!.creatorName).toBe("Anna Muster");
    expect((await listPois(f.userA, f.familyA, { categoryId: cafe }, app)).map((p) => p.name)).toEqual(["Eiscafé Muster"]);
    expect((await listPois(f.userA, f.familyA, { createdById: f.userA }, app)).map((p) => p.name)).toEqual(["Spielplatz am Bach"]);
    expect((await listPois(f.userA, f.familyA, { q: "BACH" }, app)).map((p) => p.name)).toEqual(["Spielplatz am Bach"]);
    expect((await listPoiCreators(f.userA, f.familyA, app)).map((c) => c.name)).toEqual(["Anna Muster", "Bodo Muster"]);
  });

  it("only the creator or an admin edits, moves and deletes", async () => {
    const p = await createPoi(f.userA, f.familyA, point("Von Anna"), app);
    await expect(movePoi(f.userBoth, f.familyA, p.id, 51, 9, app)).rejects.toThrow(ForbiddenError);
    await expect(updatePoi(f.userBoth, f.familyA, p.id, point("geändert"), app)).rejects.toThrow(ForbiddenError);
    await expect(deletePoi(f.userBoth, f.familyA, p.id, app)).rejects.toThrow(ForbiddenError);
    expect((await getPoi(f.userBoth, f.familyA, p.id, app)).canEdit).toBe(false);
    await movePoi(f.userA, f.familyA, p.id, 51.5, 9.25, app);
    expect(await getPoi(f.userA, f.familyA, p.id, app)).toMatchObject({ lat: 51.5, lng: 9.25, canEdit: true });
    const q = await createPoi(f.userBoth, f.familyA, point("Von Bodo"), app);
    await deletePoi(f.userA, f.familyA, q.id, app); // OWNER may
    await expect(getPoi(f.userA, f.familyA, q.id, app)).rejects.toThrow(NotFoundError);
  });

  it("never touches another family", async () => {
    await expect(getPoi(f.userA, f.familyA, poiB, app)).rejects.toThrow(NotFoundError);
    await expect(movePoi(f.userA, f.familyA, poiB, 1, 1, app)).rejects.toThrow(NotFoundError);
    await expect(deletePoi(f.userA, f.familyA, poiB, app)).rejects.toThrow(NotFoundError);
    expect((await listPois(f.userA, f.familyA, {}, app)).some((p) => p.id === poiB)).toBe(false);
  });
});

describe("temporary events", () => {
  it("archives after the last local day in the family time zone, never permanent points", async () => {
    const ev = await createPoi(f.userA, f.familyA, point("Herbstfest", { startDate: "2026-11-20", endDate: "2026-11-21" }), app);
    const one = await createPoi(f.userA, f.familyA, point("Flohmarkt", { startDate: "2026-11-21" }), app);
    expect((await getPoi(f.userA, f.familyA, one.id, app)).endDate).toBe("2026-11-21"); // one-day event
    const ids = async (now: Date, archived = false) => (await listPois(f.userA, f.familyA, { archived }, app, now)).map((p) => p.id);
    // 2026-11-21 23:30 UTC is already 2026-11-22 00:30 in Berlin: over.
    expect(await ids(new Date("2026-11-21T22:30:00Z"))).toContain(ev.id); // 23:30 Berlin, last day
    const after = await ids(new Date("2026-11-21T23:30:00Z"));
    expect(after).not.toContain(ev.id);
    expect(after).not.toContain(one.id);
    expect(after.length).toBeGreaterThan(0); // permanent points stay
    expect(await ids(new Date("2026-11-21T23:30:00Z"), true)).toEqual(expect.arrayContaining([ev.id, one.id]));
    expect(await admin.poi.count({ where: { familyId: f.familyA, endDate: null, archivedAt: { not: null } } })).toBe(0);
    expect(await admin.poi.count({ where: { id: { in: [ev.id, one.id] } } })).toBe(2); // archived, not deleted
    // moving the period into the future reactivates it
    await updatePoi(f.userA, f.familyA, ev.id, point("Herbstfest", { startDate: "2027-11-20" }), app, new Date("2026-11-22T10:00:00Z"));
    expect((await getPoi(f.userA, f.familyA, ev.id, app)).archived).toBe(false);
  });
});

describe("row level security", () => {
  it("family A sees and changes nothing of B; no rows across families", async () => {
    await raw(f.familyA, f.userA, async (tx) => {
      expect(await tx.poi.findUnique({ where: { id: poiB } })).toBeNull();
      expect(await tx.mapCategory.findUnique({ where: { id: catB } })).toBeNull();
      expect((await tx.poi.findMany()).every((p) => p.familyId === f.familyA)).toBe(true);
      expect((await tx.poi.updateMany({ where: { id: poiB }, data: { name: "gehackt" } })).count).toBe(0);
      expect((await tx.poi.deleteMany({ where: { id: poiB } })).count).toBe(0);
      expect((await tx.mapCategory.updateMany({ where: { id: catB }, data: { name: "gehackt" } })).count).toBe(0);
    });
    await expect(raw(f.familyA, f.userA, (tx) => tx.mapCategory.create({ data: { familyId: f.familyB, name: "x", icon: "pin" } }))).rejects.toThrow();
    await expect(
      raw(f.familyA, f.userA, (tx) => tx.poi.create({ data: { familyId: f.familyB, categoryId: catB, name: "x", lat: 1, lng: 1, createdById: f.userA } })),
    ).rejects.toThrow();
    // composite key: a point of A cannot use a category of B, even as table owner
    await expect(admin.poi.create({ data: { familyId: f.familyA, categoryId: catB, name: "x", lat: 1, lng: 1, createdById: f.userA } })).rejects.toThrow();
    expect(await app.poi.findMany()).toHaveLength(0); // no context
    expect(await admin.poi.count({ where: { id: poiB, name: "Ort B" } })).toBe(1);
  });

  it("database checks refuse invalid coordinates, ratings and colors", async () => {
    const base = { familyId: f.familyA, categoryId: catA, name: "x", createdById: f.userA };
    await expect(admin.poi.create({ data: { ...base, lat: 95, lng: 1 } })).rejects.toThrow();
    await expect(admin.poi.create({ data: { ...base, lat: 1, lng: 1, rating: 0 } })).rejects.toThrow();
    await expect(admin.mapCategory.create({ data: { familyId: f.familyA, name: "farbe", icon: "pin", color: "red" } })).rejects.toThrow();
  });
});
