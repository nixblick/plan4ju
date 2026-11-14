import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, app, cleanup, seed, type Fixture } from "./helpers";
import { deleteFamily, deleteOwnAccount, exportOwnData, familiesBlockingAccountDelete } from "../src/server/services/privacy";

let f: Fixture;
beforeAll(async () => {
  f = await seed();
});
afterAll(async () => {
  await cleanup(f);
});

function raw<T>(familyId: string | null, userId: string, fn: (tx: Parameters<Parameters<typeof app.$transaction>[0]>[0]) => Promise<T>) {
  return app.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.user_id', ${userId}, true)`;
    if (familyId) await tx.$executeRaw`SELECT set_config('app.family_id', ${familyId}, true)`;
    return fn(tx);
  });
}

describe("data export", () => {
  it("contains own rows only, nothing of the other family or other users, no screenshots", async () => {
    const pBoth = await admin.familyProfile.create({ data: { familyId: f.familyA, displayName: "Ben Muster", userId: f.userBoth } });
    await admin.task.create({ data: { familyId: f.familyA, title: "Meine Aufgabe", createdById: f.userBoth } });
    await admin.task.create({ data: { familyId: f.familyB, title: "Meine Aufgabe in B", createdById: f.userBoth } });
    await admin.mindfulnessEntry.create({ data: { familyId: f.familyA, profileId: pBoth.id, topic: "MOOD", date: new Date("2026-11-10"), rating: 4, note: "eigene Notiz", createdById: f.userBoth } });
    await admin.mindfulnessEntry.create({ data: { familyId: f.familyA, profileId: f.profileA, topic: "MOOD", date: new Date("2026-11-10"), rating: 2, note: "fremde Notiz", createdById: f.userA } });
    const img = Buffer.from("geheimes-bild");
    await admin.feedback.create({ data: { familyId: f.familyA, userId: f.userBoth, kind: "IDEA", message: "eigenes Feedback", pagePath: "/", appVersion: "x", device: "t", imageType: "image/png", image: img } });
    await admin.feedback.create({ data: { familyId: f.familyA, userId: f.userA, kind: "IDEA", message: "fremdes Feedback", pagePath: "/", appVersion: "x", device: "t" } });
    // surprise wish list about userBoth, reserved by userA: the reservation must not show up
    const l = await admin.wishlist.create({ data: { familyId: f.familyA, profileId: pBoth.id, title: "Ben wünscht", surprise: true, createdById: f.userBoth } });
    const w = await admin.wish.create({ data: { familyId: f.familyA, listId: l.id, title: "Fahrrad", createdById: f.userBoth } });
    await admin.wishReservation.create({ data: { familyId: f.familyA, wishId: w.id, reservedById: f.userA } });

    const data = await exportOwnData(f.userBoth, app);
    const json = JSON.stringify(data);
    expect(data.account.id).toBe(f.userBoth);
    expect(data.families).toHaveLength(2);
    expect(json).toContain("Meine Aufgabe");
    expect(json).toContain("Meine Aufgabe in B");
    expect(json).toContain("eigene Notiz");
    expect(json).toContain("eigenes Feedback");
    expect(json).toContain("Fahrrad");
    for (const foreign of ["fremde Notiz", "fremdes Feedback", "Müll rausbringen", "Geheime Aufgabe B", "Geheimer Termin B", "Oma Beispiel", f.userA, f.userB, img.toString("base64")]) {
      expect(json).not.toContain(foreign);
    }

    // userNone has no family: account only
    const none = await exportOwnData(f.userNone, app);
    expect(none.families).toEqual([]);
  });
});

describe("account deletion", () => {
  it("the last owner is blocked, by the service and by the database", async () => {
    expect((await familiesBlockingAccountDelete(f.userA, app)).map((b) => b.familyId)).toEqual([f.familyA]);
    await expect(deleteOwnAccount(f.userA, app)).rejects.toThrow(/owner/);
    await expect(raw(null, f.userA, (tx) => tx.$executeRaw`SELECT app_delete_own_account()`)).rejects.toThrow();
    expect(await admin.user.count({ where: { id: f.userA } })).toBe(1);
  });

  it("without a user context nothing is deleted", async () => {
    await expect(app.$transaction((tx) => tx.$executeRaw`SELECT app_delete_own_account()`)).rejects.toThrow();
  });

  it("removes everything personal, unlinks the profile, leaves the family and others untouched", async () => {
    const s = Math.random().toString(36).slice(2, 8);
    const u = await admin.user.create({ data: { id: `u-del-${s}`, name: "Muster Del", email: `del-${s}@example.test` } });
    await admin.session.create({ data: { id: `s-${s}`, userId: u.id, token: `t-${s}`, expiresAt: new Date(Date.now() + 3600e3) } });
    await admin.account.create({ data: { id: `a-${s}`, userId: u.id, accountId: u.id, providerId: "credential", password: "x" } });
    await admin.familyMembership.create({ data: { familyId: f.familyA, userId: u.id } });
    const p = await admin.familyProfile.create({ data: { familyId: f.familyA, displayName: "Del Muster", userId: u.id } });
    await admin.mindfulnessEntry.create({ data: { familyId: f.familyA, profileId: p.id, topic: "MOOD", date: new Date("2026-11-11"), rating: 3, createdById: u.id } });
    await admin.feedback.create({ data: { familyId: f.familyA, userId: u.id, kind: "IDEA", message: "weg damit", pagePath: "/", appVersion: "x", device: "t" } });
    await admin.notification.create({ data: { familyId: f.familyA, userId: u.id, kind: "TASK_DUE", dedupeKey: "k", title: "t", link: "/" } });
    const t = await admin.task.create({ data: { familyId: f.familyA, title: "Bleibt in der Familie", createdById: u.id } });
    const l = await admin.wishlist.create({ data: { familyId: f.familyA, profileId: f.profileA, title: "Annas Liste", createdById: f.userA } });
    const w = await admin.wish.create({ data: { familyId: f.familyA, listId: l.id, title: "Ball", createdById: f.userA } });
    await admin.wishReservation.create({ data: { familyId: f.familyA, wishId: w.id, reservedById: u.id } });

    expect(await familiesBlockingAccountDelete(u.id, app)).toEqual([]);
    await deleteOwnAccount(u.id, app);

    expect(await admin.user.count({ where: { id: u.id } })).toBe(0);
    expect(await admin.session.count({ where: { userId: u.id } })).toBe(0);
    expect(await admin.account.count({ where: { userId: u.id } })).toBe(0);
    expect(await admin.familyMembership.count({ where: { userId: u.id } })).toBe(0);
    expect(await admin.mindfulnessEntry.count({ where: { createdById: u.id } })).toBe(0);
    expect(await admin.feedback.count({ where: { userId: u.id } })).toBe(0);
    expect(await admin.notification.count({ where: { userId: u.id } })).toBe(0);
    expect(await admin.wishReservation.count({ where: { reservedById: u.id } })).toBe(0);
    expect((await admin.familyProfile.findUniqueOrThrow({ where: { id: p.id } })).userId).toBeNull();
    // family data stays, other members too
    expect(await admin.task.count({ where: { id: t.id } })).toBe(1);
    expect(await admin.family.count({ where: { id: f.familyA } })).toBe(1);
    expect(await admin.familyMembership.count({ where: { userId: f.userA } })).toBe(1);
    await admin.wishlist.delete({ where: { id: l.id } });
  });
});

describe("family deletion (RLS)", () => {
  it("only an owner of the active family; not without context, not for a foreign family", async () => {
    await expect(raw(null, f.userA, (tx) => tx.$executeRaw`SELECT app_delete_active_family()`)).rejects.toThrow();
    await expect(raw(f.familyA, f.userBoth, (tx) => tx.$executeRaw`SELECT app_delete_active_family()`)).rejects.toThrow();
    await expect(raw(f.familyB, f.userA, (tx) => tx.$executeRaw`SELECT app_delete_active_family()`)).rejects.toThrow();
    await expect(deleteFamily(f.userBoth, f.familyA, app)).rejects.toThrow();
    await expect(deleteFamily(f.userA, f.familyB, app)).rejects.toThrow();
    expect(await admin.family.count({ where: { id: { in: [f.familyA, f.familyB] } } })).toBe(2);
  });

  it("an owner deletes the whole family; the other family stays", async () => {
    await admin.familyMembership.update({ where: { familyId_userId: { familyId: f.familyB, userId: f.userBoth } }, data: { role: "ADMIN" } });
    await deleteFamily(f.userB, f.familyB, app);
    expect(await admin.family.count({ where: { id: f.familyB } })).toBe(0);
    expect(await admin.task.count({ where: { familyId: f.familyB } })).toBe(0);
    expect(await admin.familyMembership.count({ where: { familyId: f.familyB } })).toBe(0);
    expect(await admin.family.count({ where: { id: f.familyA } })).toBe(1);
    // now userB owns nothing and may delete the account
    expect(await familiesBlockingAccountDelete(f.userB, app)).toEqual([]);
  });
});
