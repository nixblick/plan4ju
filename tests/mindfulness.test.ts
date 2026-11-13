import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, app, cleanup, seed, type Fixture } from "./helpers";
import { ForbiddenError, NotFoundError } from "../src/server/errors";
import { allowedVisibilities, average, ratingLabel } from "../src/lib/achtsamkeit";
import { getDashboard } from "../src/server/services/dashboard";
import {
  deleteEntry, getEntry, listEntries, listVisibleProfiles, listWritableProfiles, saveEntry,
} from "../src/server/services/mindfulness";

// userA (OWNER of A), userBoth (MEMBER of A and B), userNone joins A here as a third member.
let f: Fixture;
let profileBoth = "";
let profileThird = "";
let childA = "";
let privateA = "";
let familyA = "";
let selectedA = "";
let healthA = "";
const D = "2026-11-10";
const range = { from: "2026-11-01", to: "2026-11-30" };

beforeAll(async () => {
  f = await seed();
  await admin.familyMembership.create({ data: { familyId: f.familyA, userId: f.userNone } });
  profileBoth = (await admin.familyProfile.create({ data: { familyId: f.familyA, displayName: "Bodo Muster", userId: f.userBoth } })).id;
  profileThird = (await admin.familyProfile.create({ data: { familyId: f.familyA, displayName: "Dora Muster", userId: f.userNone } })).id;
  childA = (await admin.familyProfile.create({ data: { familyId: f.familyA, displayName: "Kim Muster", isChild: true } })).id;
  // userBoth writes the entries; userA (the OWNER) is the one who must not see the private ones.
  privateA = await saveEntry(f.userBoth, f.familyA, { profileId: profileBoth, topic: "MOOD", date: D, rating: 2, note: "Geheime Notiz", visibility: "PRIVATE" }, app);
  familyA = await saveEntry(f.userBoth, f.familyA, { profileId: profileBoth, topic: "SLEEP", date: D, rating: 4, visibility: "FAMILY" }, app);
  selectedA = await saveEntry(f.userBoth, f.familyA, { profileId: profileBoth, topic: "WORK", date: D, rating: 3, visibility: "SELECTED", viewerIds: [f.userNone] }, app);
  healthA = await saveEntry(f.userBoth, f.familyA, { profileId: profileBoth, topic: "HEALTH", date: D, rating: 1, note: "Arzt", visibility: "PRIVATE" }, app);
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

describe("lib", () => {
  it("maps the scale to emoji and words and keeps health restrictive", () => {
    expect(ratingLabel(1)).toBe("😞 1 von 5 (schlecht)");
    expect(ratingLabel(5)).toBe("😄 5 von 5 (super)");
    expect(allowedVisibilities("HEALTH")).toEqual(["PRIVATE", "SELECTED"]);
    expect(allowedVisibilities("MOOD")).toContain("FAMILY");
    expect(average([])).toBeNull();
    expect(average([1, 2, 2])).toBe(1.7);
  });
});

describe("service visibility", () => {
  it("the author sees all own entries, with viewers", async () => {
    const all = await listEntries(f.userBoth, f.familyA, range, app);
    expect(all.map((e) => e.id).sort()).toEqual([privateA, familyA, selectedA, healthA].sort());
    expect(all.find((e) => e.id === selectedA)!.viewers.map((v) => v.userId)).toEqual([f.userNone]);
  });

  it("the owner of the family sees only the FAMILY entry, and private ids give the same NotFound as unknown ids", async () => {
    const seen = await listEntries(f.userA, f.familyA, range, app);
    expect(seen.map((e) => e.id)).toEqual([familyA]);
    expect(seen[0]!.viewers).toEqual([]);
    for (const id of [privateA, selectedA, healthA, "gibt-es-nicht"]) {
      await expect(getEntry(f.userA, f.familyA, id, app)).rejects.toBeInstanceOf(NotFoundError);
    }
    await expect(deleteEntry(f.userA, f.familyA, familyA, app)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("a selected viewer sees the shared entry but not the private ones and not the viewer list", async () => {
    const seen = await listEntries(f.userNone, f.familyA, range, app);
    expect(seen.map((e) => e.id).sort()).toEqual([familyA, selectedA].sort());
    expect((await getEntry(f.userNone, f.familyA, selectedA, app)).viewers).toEqual([]);
  });

  it("a person with only private entries does not appear in the picker", async () => {
    const child = await saveEntry(f.userBoth, f.familyA, { profileId: childA, topic: "MOOD", date: D, rating: 5, visibility: "PRIVATE" }, app);
    expect((await listVisibleProfiles(f.userA, f.familyA, app)).map((p) => p.id)).toEqual([profileBoth]);
    expect((await listVisibleProfiles(f.userBoth, f.familyA, app)).map((p) => p.id).sort()).toEqual([profileBoth, childA].sort());
    await deleteEntry(f.userBoth, f.familyA, child, app);
  });

  it("other families see nothing", async () => {
    expect(await listEntries(f.userB, f.familyB, range, app)).toEqual([]);
    await expect(getEntry(f.userB, f.familyB, familyA, app)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("refuses health for the whole family, writing for another adult, and unknown viewers", async () => {
    await expect(saveEntry(f.userBoth, f.familyA, { profileId: profileBoth, topic: "HEALTH", date: D, rating: 3, visibility: "FAMILY" }, app)).rejects.toThrow();
    await expect(saveEntry(f.userA, f.familyA, { profileId: profileBoth, topic: "FOOD", date: D, rating: 3 }, app)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(saveEntry(f.userBoth, f.familyA, { profileId: profileBoth, topic: "FOOD", date: D, rating: 3, visibility: "SELECTED", viewerIds: [f.userB] }, app)).rejects.toBeInstanceOf(NotFoundError);
    expect((await listWritableProfiles(f.userA, f.familyA, app)).map((p) => p.id).sort()).toEqual([f.profileA, childA].sort());
  });

  it("two parents can rate the same child on the same day without seeing each other's private entry", async () => {
    const a = await saveEntry(f.userA, f.familyA, { profileId: childA, topic: "SLEEP", date: D, rating: 2 }, app);
    const b = await saveEntry(f.userBoth, f.familyA, { profileId: childA, topic: "SLEEP", date: D, rating: 4 }, app);
    expect(a).not.toBe(b);
    expect((await listEntries(f.userA, f.familyA, { ...range, profileId: childA }, app)).map((e) => e.id)).toEqual([a]);
    // Saving again updates the own entry instead of adding a second one.
    expect(await saveEntry(f.userA, f.familyA, { profileId: childA, topic: "SLEEP", date: D, rating: 3 }, app)).toBe(a);
    await deleteEntry(f.userA, f.familyA, a, app);
    await deleteEntry(f.userBoth, f.familyA, b, app);
  });

  it("switching from SELECTED to PRIVATE drops the viewer", async () => {
    const id = await saveEntry(f.userBoth, f.familyA, { profileId: profileBoth, topic: "LEISURE", date: D, rating: 4, visibility: "SELECTED", viewerIds: [f.userNone] }, app);
    expect((await getEntry(f.userNone, f.familyA, id, app)).id).toBe(id);
    await saveEntry(f.userBoth, f.familyA, { profileId: profileBoth, topic: "LEISURE", date: D, rating: 4, visibility: "PRIVATE" }, app);
    await expect(getEntry(f.userNone, f.familyA, id, app)).rejects.toBeInstanceOf(NotFoundError);
    await deleteEntry(f.userBoth, f.familyA, id, app);
  });

  it("does not show up in the dashboard or the feedback context of others", async () => {
    expect(JSON.stringify(await getDashboard(f.userA, f.familyA, new Date(), app))).not.toContain("Geheime Notiz");
  });
});

describe("row level security with the app role (no service logic)", () => {
  it("the owner gets nothing by id, by findMany and by aggregate SQL", async () => {
    await raw(f.familyA, f.userA, async (tx) => {
      expect(await tx.mindfulnessEntry.findUnique({ where: { id: privateA } })).toBeNull();
      expect(await tx.mindfulnessEntry.findUnique({ where: { id: healthA } })).toBeNull();
      expect((await tx.mindfulnessEntry.findMany()).map((e) => e.id)).toEqual([familyA]);
      const agg = await tx.$queryRaw<{ n: bigint; s: bigint | null }[]>`SELECT count(*) AS n, sum(rating) AS s FROM mindfulness_entry`;
      expect(Number(agg[0]!.n)).toBe(1);
      expect(Number(agg[0]!.s)).toBe(4);
      expect(await tx.mindfulnessShare.findMany()).toEqual([]);
    });
  });

  it("nobody but the author can update or delete, not even FAMILY entries", async () => {
    await raw(f.familyA, f.userA, async (tx) => {
      expect((await tx.mindfulnessEntry.updateMany({ where: { id: familyA }, data: { visibility: "PRIVATE" } })).count).toBe(0);
      expect((await tx.mindfulnessEntry.updateMany({ where: { id: privateA }, data: { visibility: "FAMILY" } })).count).toBe(0);
      expect((await tx.mindfulnessEntry.deleteMany({ where: { id: { in: [privateA, familyA] } } })).count).toBe(0);
    });
  });

  it("a member cannot grant itself access to someone else's entry", async () => {
    await expect(raw(f.familyA, f.userA, (tx) =>
      tx.mindfulnessShare.create({ data: { familyId: f.familyA, entryId: privateA, ownerId: f.userA, userId: f.userNone } }))).rejects.toThrow();
    await expect(raw(f.familyA, f.userA, (tx) =>
      tx.mindfulnessShare.create({ data: { familyId: f.familyA, entryId: privateA, ownerId: f.userBoth, userId: f.userA } }))).rejects.toThrow();
    await raw(f.familyA, f.userA, async (tx) => {
      expect(await tx.mindfulnessEntry.findUnique({ where: { id: privateA } })).toBeNull();
    });
  });

  it("entries cannot be written for another adult or under another author", async () => {
    await expect(raw(f.familyA, f.userA, (tx) =>
      tx.mindfulnessEntry.create({ data: { familyId: f.familyA, profileId: profileThird, topic: "MOOD", date: new Date(D), rating: 1, createdById: f.userA } }))).rejects.toThrow();
    await expect(raw(f.familyA, f.userA, (tx) =>
      tx.mindfulnessEntry.create({ data: { familyId: f.familyA, profileId: profileBoth, topic: "FOOD", date: new Date(D), rating: 1, createdById: f.userBoth } }))).rejects.toThrow();
  });

  it("the database refuses health entries for the whole family and ratings off the scale", async () => {
    await expect(raw(f.familyA, f.userBoth, (tx) =>
      tx.mindfulnessEntry.update({ where: { id: healthA }, data: { visibility: "FAMILY" } }))).rejects.toThrow();
    await expect(raw(f.familyA, f.userBoth, (tx) =>
      tx.mindfulnessEntry.update({ where: { id: privateA }, data: { rating: 6 } }))).rejects.toThrow();
  });

  it("the selected viewer sees exactly the shared entry; a foreign family sees nothing", async () => {
    await raw(f.familyA, f.userNone, async (tx) => {
      expect((await tx.mindfulnessEntry.findMany()).map((e) => e.id).sort()).toEqual([familyA, selectedA].sort());
    });
    await raw(f.familyB, f.userBoth, async (tx) => {
      expect(await tx.mindfulnessEntry.findMany()).toEqual([]);
      expect(await tx.mindfulnessEntry.findUnique({ where: { id: familyA } })).toBeNull();
    });
  });

  it("leaving the family removes the author's entries and the viewer's shares", async () => {
    const id = await saveEntry(f.userNone, f.familyA, { profileId: profileThird, topic: "MOOD", date: D, rating: 3, visibility: "FAMILY" }, app);
    await admin.familyMembership.delete({ where: { familyId_userId: { familyId: f.familyA, userId: f.userNone } } });
    expect(await admin.mindfulnessEntry.findUnique({ where: { id } })).toBeNull();
    expect(await admin.mindfulnessShare.count({ where: { entryId: selectedA } })).toBe(0);
  });
});
