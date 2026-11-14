import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, app, cleanup, seed, type Fixture } from "./helpers";
import { ForbiddenError, NotFoundError } from "../src/server/errors";
import { deleteCheckin, getPref, listEntries, saveCheckin, savePref } from "../src/server/services/mindfulness";

const MIGRATION = "prisma/migrations/20261206000000_mindfulness_checkin/migration.sql";

describe("migration mindfulness_checkin", () => {
  const schema = `mig_${Math.random().toString(36).slice(2, 10)}`;
  afterAll(async () => {
    await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  });

  it("keeps every row with rating, note and visibility; each old row becomes its own check-in", async () => {
    const statements = readFileSync(MIGRATION, "utf8")
      .split("\n").filter((l) => !l.startsWith("--")).join("\n")
      .split(";").map((s) => s.trim()).filter(Boolean);
    const rows = await admin.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
      await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}", public`);
      await tx.$executeRawUnsafe(`CREATE TYPE "${schema}"."MindfulnessVisibility" AS ENUM ('PRIVATE', 'SELECTED', 'FAMILY')`);
      await tx.$executeRawUnsafe(`CREATE TABLE "family_membership" ("familyId" text, "userId" text, PRIMARY KEY ("familyId", "userId"))`);
      await tx.$executeRawUnsafe(`CREATE TABLE "mindfulness_entry" (id text PRIMARY KEY, "familyId" text, topic text, rating int, note text, visibility "${schema}"."MindfulnessVisibility")`);
      await tx.$executeRawUnsafe(`INSERT INTO "mindfulness_entry" VALUES ('e1','f','MOOD',4,'gut','FAMILY'), ('e2','f','SLEEP',2,NULL,'SELECTED'), ('e3','f','HEALTH',1,NULL,'PRIVATE')`);
      for (const s of statements) await tx.$executeRawUnsafe(s);
      return tx.$queryRawUnsafe<{ id: string; rating: number; note: string | null; visibility: string; checkinId: string }[]>(
        `SELECT id, rating, note, visibility::text AS visibility, "checkinId" FROM "mindfulness_entry" ORDER BY id`,
      );
    });
    expect(rows).toEqual([
      { id: "e1", rating: 4, note: "gut", visibility: "FAMILY", checkinId: "e1" },
      { id: "e2", rating: 2, note: null, visibility: "SELECTED", checkinId: "e2" },
      { id: "e3", rating: 1, note: null, visibility: "PRIVATE", checkinId: "e3" },
    ]);
  });
});

describe("questionnaire", () => {
  let f: Fixture;
  let pBoth = "";
  beforeAll(async () => {
    f = await seed();
    pBoth = (await admin.familyProfile.create({ data: { familyId: f.familyA, displayName: "Bodo Muster", userId: f.userBoth } })).id;
  });
  afterAll(async () => {
    await cleanup(f);
  });
  const range = { from: "2026-11-01", to: "2026-11-30" };

  it("one submit stores all ratings as one check-in, private by default", async () => {
    const id = await saveCheckin(f.userA, f.familyA, {
      profileId: f.profileA, date: "2026-11-14", note: "ruhiger Tag",
      ratings: [{ topic: "MOOD", rating: 4 }, { topic: "SLEEP", rating: 3 }, { topic: "HEALTH", rating: 5 }],
    }, app);
    const mine = await listEntries(f.userA, f.familyA, { ...range, profileId: f.profileA }, app);
    expect(mine.map((e) => [e.topic, e.rating, e.visibility, e.checkinId]).sort()).toEqual([
      ["HEALTH", 5, "PRIVATE", id], ["MOOD", 4, "PRIVATE", id], ["SLEEP", 3, "PRIVATE", id],
    ]);
    expect(await listEntries(f.userBoth, f.familyA, { ...range, profileId: f.profileA }, app)).toEqual([]);
  });

  it("the visibility setting applies to new check-ins only; health never goes to the family", async () => {
    expect(await getPref(f.userA, f.familyA, app)).toEqual({ visibility: "PRIVATE", viewerIds: [] });
    await savePref(f.userA, f.familyA, { visibility: "FAMILY" }, app);
    await saveCheckin(f.userA, f.familyA, { profileId: f.profileA, date: "2026-11-15", ratings: [{ topic: "FOOD", rating: 2 }, { topic: "HEALTH", rating: 3 }] }, app);
    const seen = await listEntries(f.userBoth, f.familyA, { ...range, profileId: f.profileA }, app);
    expect(seen.map((e) => `${e.date} ${e.topic}`)).toEqual(["2026-11-15 FOOD"]);
    await savePref(f.userA, f.familyA, { visibility: "SELECTED", viewerIds: [f.userBoth] }, app);
    await saveCheckin(f.userA, f.familyA, { profileId: f.profileA, date: "2026-11-16", ratings: [{ topic: "HEALTH", rating: 4 }] }, app);
    const seen2 = await listEntries(f.userBoth, f.familyA, { ...range, profileId: f.profileA }, app);
    expect(seen2.map((e) => `${e.date} ${e.topic}`).sort()).toEqual(["2026-11-15 FOOD", "2026-11-16 HEALTH"]);
    // the 14th stays private although the setting changed
    expect(seen2.some((e) => e.date === "2026-11-14")).toBe(false);
  });

  it("rejects empty, foreign profiles and unknown viewers; deletes a whole own check-in", async () => {
    await expect(saveCheckin(f.userA, f.familyA, { profileId: f.profileA, date: "2026-11-17", ratings: [] }, app)).rejects.toThrow();
    await expect(saveCheckin(f.userA, f.familyA, { profileId: pBoth, date: "2026-11-17", ratings: [{ topic: "MOOD", rating: 3 }] }, app)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(savePref(f.userA, f.familyA, { visibility: "SELECTED", viewerIds: [f.userB] }, app)).rejects.toBeInstanceOf(NotFoundError);
    const id = await saveCheckin(f.userA, f.familyA, { profileId: f.profileA, date: "2026-11-18", ratings: [{ topic: "MOOD", rating: 3 }, { topic: "WORK", rating: 2 }] }, app);
    await expect(deleteCheckin(f.userBoth, f.familyA, id, app)).rejects.toBeInstanceOf(NotFoundError);
    await deleteCheckin(f.userA, f.familyA, id, app);
    expect((await listEntries(f.userA, f.familyA, { from: "2026-11-18", to: "2026-11-18" }, app))).toEqual([]);
  });
});
