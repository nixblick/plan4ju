import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { admin, app, cleanup, seed, type Fixture } from "./helpers";
import { BELL_SYNC_MS, bellCount, resetBellSync } from "../src/server/notification-sync";
import { createBirthday } from "../src/server/services/birthdays";

// The bell on every page generates notifications only every few minutes, or at once after a change.
let f: Fixture;
const NOW = new Date("2026-11-16T08:00:00Z");
beforeAll(async () => { f = await seed(); });
beforeEach(() => resetBellSync());
afterAll(async () => { await cleanup(f); await app.$disconnect(); await admin.$disconnect(); });

describe("bellCount", () => {
  it("only counts between syncs, and syncs again after the interval", async () => {
    const before = await bellCount(f.userA, f.familyA, NOW, app);
    // A birthday written behind the services' back (no change mark) is not seen until the interval is over.
    const b = await admin.birthday.create({ data: { familyId: f.familyA, name: "Leise Muster", month: 11, day: 16, createdById: f.userA } });
    expect(await bellCount(f.userA, f.familyA, new Date(NOW.getTime() + 60_000), app)).toBe(before);
    expect(await bellCount(f.userA, f.familyA, new Date(NOW.getTime() + BELL_SYNC_MS), app)).toBe(before + 1);
    await admin.birthday.delete({ where: { id: b.id } });
  });

  it("a change through the services syncs at once, also for another member", async () => {
    const before = await bellCount(f.userA, f.familyA, NOW, app);
    await createBirthday(f.userA, f.familyA, { name: "Laut Muster", month: 11, day: 16 }, app);
    expect(await bellCount(f.userA, f.familyA, new Date(NOW.getTime() + 1000), app)).toBe(before + 1);
  });
});
