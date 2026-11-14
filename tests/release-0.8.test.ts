import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { admin, app, cleanup, seed, type Fixture } from "./helpers";
import { allowedElements, DASHBOARD_KEYS, visibleElements } from "../src/lib/dashboard-elements";
import { LEGACY_ROUTES } from "../src/lib/legacy-routes.mjs";
import { MODULE_KEYS, type ModuleKey } from "../src/lib/modules";
import { birthdaysAround } from "../src/server/services/dashboard";
import { getHiddenElements, setVisibleElements } from "../src/server/services/dashboard-prefs";
import { getModules, setModule } from "../src/server/services/modules";
import { createItem, getShoppingList, updateItem } from "../src/server/services/shopping";
import { GEOCODE_USER_AGENT, GeocodeBusyError, normaliseQuery, parseNominatim, resetGeocode, searchAddress } from "../src/server/geocode";
import type { TransportRequest } from "../src/server/safe-fetch";
import config from "../next.config.mjs";

let f: Fixture;
beforeAll(async () => {
  f = await seed();
});
afterAll(async () => {
  await cleanup(f);
  await app.$disconnect();
  await admin.$disconnect();
});

const allOn = Object.fromEntries(MODULE_KEYS.map((k) => [k, true])) as Record<ModuleKey, boolean>;

describe("modules Schule heute and Sterne", () => {
  it("start off for a new family; admins switch them, members cannot", async () => {
    const m = await getModules(f.userA, f.familyA, app);
    expect([m.school, m.stars]).toEqual([false, false]);
    await setModule(f.userA, f.familyA, "school", true, app);
    expect((await getModules(f.userA, f.familyA, app)).school).toBe(true);
    // userBoth is a plain member of A: the service refuses, and so does the trigger below it
    await expect(setModule(f.userBoth, f.familyA, "stars", true, app)).rejects.toThrow();
    await expect(
      app.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.user_id', ${f.userBoth}, true)`;
        await tx.$executeRaw`SELECT set_config('app.family_id', ${f.familyA}, true)`;
        await tx.family.update({ where: { id: f.familyA }, data: { moduleStars: true } });
      }),
    ).rejects.toThrow();
    await setModule(f.userA, f.familyA, "school", false, app);
  });

  it("the migration kept both on for families that existed before (column default changed afterwards)", async () => {
    const d = await admin.$queryRaw<{ column_name: string; column_default: string }[]>`
      SELECT column_name, column_default FROM information_schema.columns
      WHERE table_name = 'family' AND column_name IN ('moduleSchool','moduleStars') ORDER BY column_name`;
    expect(d.map((r) => r.column_default)).toEqual(["false", "false"]);
  });
});

describe("dashboard setting per user", () => {
  it("default: everything the family allows", async () => {
    expect(await getHiddenElements(f.userBoth, f.familyA, app)).toEqual([]);
    const mods = await getModules(f.userA, f.familyA, app);
    const v = visibleElements(mods, []);
    expect(v.has("week")).toBe(true);
    expect(v.has("school")).toBe(false); // module off
    expect(v.has("meals")).toBe(true);
  });

  it("hiding is per user and family; elements not offered keep their setting; unknown keys are dropped", async () => {
    await setVisibleElements(f.userBoth, f.familyA, ["week", "tasks", "birthdays", "erfunden"], ["tasks"], app);
    expect(await getHiddenElements(f.userBoth, f.familyA, app)).toEqual(["week", "birthdays"]);
    expect(await getHiddenElements(f.userBoth, f.familyB, app)).toEqual([]);
    expect(await getHiddenElements(f.userA, f.familyA, app)).toEqual([]);
    // the next save offers only "tasks" (e.g. other modules off): week and birthdays stay hidden
    await setVisibleElements(f.userBoth, f.familyA, ["tasks"], [], app);
    expect(await getHiddenElements(f.userBoth, f.familyA, app)).toEqual(["week", "tasks", "birthdays"]);
    await setVisibleElements(f.userBoth, f.familyA, DASHBOARD_KEYS, DASHBOARD_KEYS, app);
    expect(await getHiddenElements(f.userBoth, f.familyA, app)).toEqual([]);
  });

  it("a hidden element stays hidden, a switched-off module hides its element whatever the user chose", () => {
    const off = { ...allOn, mindfulness: false, school: false };
    expect(allowedElements(off)).not.toContain("mindfulness");
    expect(visibleElements(off, []).has("school")).toBe(false);
    expect(visibleElements(allOn, ["stars", "nonsense"]).has("stars")).toBe(false);
    expect(visibleElements(allOn, ["stars"]).size).toBe(DASHBOARD_KEYS.length - 1);
  });
});

describe("birthdays on the start page: 2 days back, 3 ahead", () => {
  const b = (id: string, month: number, day: number, birthYear: number | null = null) => ({ id, name: id, month, day, birthYear });
  it("takes the window and nothing else", () => {
    const r = birthdaysAround([b("vorvorgestern", 11, 11), b("vorgestern", 11, 12), b("heute", 11, 14, 2016), b("in3", 11, 17), b("in4", 11, 18)], "2026-11-14");
    expect(r.map((x) => [x.id, x.inDays])).toEqual([["vorgestern", -2], ["heute", 0], ["in3", 3]]);
    expect(r.find((x) => x.id === "heute")!.turns).toBe(10);
  });
  it("works across the turn of the year and with 29 February", () => {
    expect(birthdaysAround([b("silvester", 12, 31), b("neujahr", 1, 2)], "2027-01-01").map((x) => [x.id, x.inDays, x.date])).toEqual([
      ["silvester", -1, "2026-12-31"],
      ["neujahr", 1, "2027-01-02"],
    ]);
    expect(birthdaysAround([b("schalttag", 2, 29)], "2027-03-01").map((x) => [x.date, x.inDays])).toEqual([["2027-02-28", -1]]);
    expect(birthdaysAround([b("schalttag", 2, 29)], "2028-02-27").map((x) => [x.date, x.inDays])).toEqual([["2028-02-29", 2]]);
  });
});

describe("shopping categories", () => {
  it("automatic by name, manual choice wins and is remembered for the same name", async () => {
    const hack = await createItem(f.userA, f.familyA, { name: "Rinderhack" }, app);
    await createItem(f.userA, f.familyA, { name: "Äpfel" }, app);
    await createItem(f.userA, f.familyA, { name: "Klopapier" }, app);
    await createItem(f.userA, f.familyA, { name: "Gummibärchen" }, app);
    const spezial = await createItem(f.userA, f.familyA, { name: "Spezialsoße", category: "GEWUERZ" }, app);
    let list = await getShoppingList(f.userA, f.familyA, {}, app);
    const cat = (n: string) => list.open.find((i) => i.name === n)!;
    expect(cat("Rinderhack").category).toBe("FLEISCH");
    expect(cat("Rinderhack").categoryManual).toBe(false);
    expect(cat("Spezialsoße")).toMatchObject({ category: "GEWUERZ", categoryManual: true });
    // sorted by category (order of the list), Sonstiges last
    expect(list.open.map((i) => i.name)).toEqual(["Rinderhack", "Äpfel", "Spezialsoße", "Gummibärchen", "Klopapier"]);

    // the same name again, without a choice: the remembered category
    await createItem(f.userA, f.familyA, { name: "  spezialsoße " }, app);
    list = await getShoppingList(f.userA, f.familyA, {}, app);
    expect(list.open.filter((i) => i.name.trim().toLowerCase() === "spezialsoße").map((i) => i.category)).toEqual(["GEWUERZ", "GEWUERZ"]);

    // a manual change on an automatic entry is remembered as well
    await updateItem(f.userA, f.familyA, hack.id, { name: "Rinderhack", category: "TIEFKUEHL" }, app);
    await createItem(f.userA, f.familyA, { name: "Rinderhack" }, app);
    list = await getShoppingList(f.userA, f.familyA, {}, app);
    expect(list.open.filter((i) => i.name === "Rinderhack").map((i) => i.category)).toEqual(["TIEFKUEHL", "TIEFKUEHL"]);

    // back to automatic forgets the name
    await updateItem(f.userA, f.familyA, spezial.id, { name: "Spezialsoße", category: "" }, app);
    list = await getShoppingList(f.userA, f.familyA, {}, app);
    expect(list.open.filter((i) => i.name.trim().toLowerCase() === "spezialsoße").map((i) => i.category)).toEqual(["SONSTIGES", "SONSTIGES"]);
  });

  it("refuses an unknown category", async () => {
    expect(() => createItem(f.userA, f.familyA, { name: "x", category: "KAPUTT" }, app)).toThrow();
  });

  it("memory is per family", async () => {
    await createItem(f.userB, f.familyB, { name: "Hausmischung", category: "OBST" }, app);
    await createItem(f.userA, f.familyA, { name: "Hausmischung" }, app);
    const a = await getShoppingList(f.userA, f.familyA, {}, app);
    expect(a.open.find((i) => i.name === "Hausmischung")!.category).toBe("SONSTIGES");
  });
});

describe("old addresses redirect to the new ones", () => {
  it("the table covers the moved pages", () => {
    expect(LEGACY_ROUTES).toEqual(
      expect.arrayContaining([
        { source: "/geburtstage", destination: "/kalender/geburtstage" },
        { source: "/familie", destination: "/einstellungen/mitglieder" },
        { source: "/familie/:path*", destination: "/einstellungen/:path*" },
      ]),
    );
  });
  it("next.config serves them as redirects, temporary", async () => {
    const r = await config.redirects!();
    expect(r).toEqual(LEGACY_ROUTES.map((x) => ({ ...x, permanent: false })));
  });
  it("Permissions-Policy allows geolocation for the own origin only", async () => {
    const h = await config.headers!();
    const pp = h[0]!.headers.find((x) => x.key === "Permissions-Policy")!.value;
    expect(pp).toContain("geolocation=(self)");
    expect(pp).toContain("camera=()");
  });
});

describe("address search (Nominatim through safe-fetch, no network)", () => {
  const resolve = async () => [{ address: "93.184.216.34", family: 4 as const }];
  const body = JSON.stringify([
    { lat: "50.1109", lon: "8.6821", display_name: "Musterstraße 1, Musterstadt" },
    { lat: "kaputt", lon: "8", display_name: "ungültig" },
    { lat: "91", lon: "8", display_name: "außerhalb" },
  ]);
  let calls: TransportRequest[] = [];
  const transport = async (r: TransportRequest) => {
    calls.push(r);
    return { status: 200, body: Buffer.from(body) };
  };
  beforeEach(() => {
    resetGeocode();
    calls = [];
  });

  it("asks the public instance with a generic User-Agent and keeps only valid results", async () => {
    const r = await searchAddress("Musterstraße 1", { resolve, transport });
    expect(r).toEqual([{ label: "Musterstraße 1, Musterstadt", lat: 50.1109, lng: 8.6821 }]);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url.hostname).toBe("nominatim.openstreetmap.org");
    expect(calls[0]!.url.searchParams.get("q")).toBe("Musterstraße 1");
    expect(calls[0]!.url.searchParams.get("format")).toBe("jsonv2");
    expect(calls[0]!.userAgent).toBe(GEOCODE_USER_AGENT);
    expect(GEOCODE_USER_AGENT).toBe("Plan4JU");
  });

  it("caches (case and spaces do not matter) and searches nothing below 3 characters", async () => {
    await searchAddress("Musterstraße 1", { resolve, transport });
    await searchAddress("  musterstraße   1 ", { resolve, transport });
    expect(await searchAddress("ab", { resolve, transport })).toEqual([]);
    expect(calls).toHaveLength(1);
    expect(normaliseQuery("ab")).toBeNull();
    expect(normaliseQuery("x".repeat(121))).toBeNull();
  });

  it("spaces requests at least one second apart for the whole server and refuses a long queue", async () => {
    const t = 1_000_000;
    const now = () => t;
    const times: number[] = [];
    const timed = async (r: TransportRequest) => {
      times.push(Date.now());
      return transport(r);
    };
    const start = Date.now();
    await Promise.all([searchAddress("Ort eins", { resolve, transport: timed }), searchAddress("Ort zwei", { resolve, transport: timed })]);
    expect(times).toHaveLength(2);
    expect(Math.abs(times[1]! - times[0]!)).toBeGreaterThanOrEqual(950);
    expect(Date.now() - start).toBeGreaterThanOrEqual(950);
    // with a frozen clock five more requests queue up beyond the maximum wait
    resetGeocode();
    const queued = ["a1", "a2", "a3", "a4", "a5", "a6"].map((q) => searchAddress(`Ort ${q}`, { resolve, transport, now }).catch((e) => e));
    const res = await Promise.all(queued);
    expect(res.filter((x) => x instanceof GeocodeBusyError).length).toBeGreaterThan(0);
  }, 15_000);

  it("rejects a broken answer", () => {
    expect(() => parseNominatim("<html>")).toThrow();
    expect(() => parseNominatim("{}")).toThrow();
    expect(parseNominatim("[]")).toEqual([]);
  });
});
