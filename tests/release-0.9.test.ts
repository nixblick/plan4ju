import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, app, cleanup, seed, type Fixture } from "./helpers";
import { ForbiddenError, ModuleOffError, NotFoundError } from "../src/server/errors";
import { DEFAULT_ORDER, moveElement, orderElements } from "../src/lib/dashboard-elements";
import { CIRCLE_COLORS, TOPICS, TOPIC_LABELS, ratingText } from "../src/lib/achtsamkeit";
import { esc, renderSharedList } from "../src/lib/shared-wishlist-html";
import { getDashboardLayout, setVisibleElements } from "../src/server/services/dashboard-prefs";
import { getPref, listEntries, saveCheckin, savePref, saveSymbol } from "../src/server/services/mindfulness";
import { createRoutine, deleteRoutine, listOccurrences } from "../src/server/services/routines";
import { createShare, createWish, createWishlist, reserveWish, resolveShare, revokeShare, shareInfo } from "../src/server/services/wishes";
import { setModule } from "../src/server/services/modules";
import { hashToken } from "../src/server/tokens";

// Release 0.9 (customer feedback): start page order, three more mindfulness topics, rating symbol,
// deleting routines and read-only share links for wish lists.

let f: Fixture;
let profileBoth = "";
beforeAll(async () => {
  f = await seed();
  profileBoth = (await admin.familyProfile.create({ data: { familyId: f.familyA, displayName: "Bodo Muster", userId: f.userBoth } })).id;
});
afterAll(async () => {
  await cleanup(f);
  await app.$disconnect();
  await admin.$disconnect();
});

describe("start page order", () => {
  it("defaults to meals directly above the tasks", () => {
    const o = orderElements([]);
    expect(o).toEqual([...DEFAULT_ORDER]);
    expect(o.indexOf("tasks") - o.indexOf("meals")).toBe(1);
  });

  it("keeps the stored order, drops unknown and duplicate keys, inserts missing keys at their default place", () => {
    const o = orderElements(["tasks", "evil<script>", "meals", "tasks", "next"]);
    expect(o.filter((k) => ["tasks", "meals", "next"].includes(k))).toEqual(["tasks", "meals", "next"]);
    expect(o[0]).toBe("tasks");
    expect(new Set(o).size).toBe(DEFAULT_ORDER.length);
    expect(o).not.toContain("evil<script>");
    // "today" follows its default predecessor "next"
    expect(o.indexOf("today")).toBe(o.indexOf("next") + 1);
  });

  it("moves one step among the offered elements and stops at the edges", () => {
    const base = orderElements([]);
    const offered = base.filter((k) => k !== "events"); // events not offered: it is skipped over and keeps its place
    const up = moveElement(base, offered, "routines", -1);
    expect(up.indexOf("routines")).toBe(base.indexOf("week"));
    expect(up.indexOf("events")).toBe(base.indexOf("events"));
    expect(moveElement(base, offered, "next", -1)).toEqual(base);
    expect(moveElement(base, offered, "mindfulness", 1)).toEqual(base);
    expect(moveElement(base, offered, "nope", 1)).toEqual(base);
  });

  it("stores order per user and keeps the ticks of the same form", async () => {
    const offered = [...DEFAULT_ORDER].filter((k) => !["school", "stars"].includes(k));
    await setVisibleElements(f.userA, f.familyA, offered, offered.filter((k) => k !== "week"), app, { key: "meals", dir: -1 });
    const mine = await getDashboardLayout(f.userA, f.familyA, app);
    expect(mine.hidden).toEqual(["week"]);
    expect(mine.order.indexOf("meals")).toBeLessThan(mine.order.indexOf("routines"));
    // a later save without a move keeps the order
    await setVisibleElements(f.userA, f.familyA, offered, offered, app);
    expect((await getDashboardLayout(f.userA, f.familyA, app)).order).toEqual(mine.order);
    // another member is unaffected
    expect((await getDashboardLayout(f.userBoth, f.familyA, app)).order).toEqual([...DEFAULT_ORDER]);
  });

  it("rejects an oversized order list in the database", async () => {
    await expect(
      admin.dashboardPref.update({ where: { familyId_userId: { familyId: f.familyA, userId: f.userA } }, data: { order: Array.from({ length: 31 }, (_, i) => `k${i}`) } }),
    ).rejects.toThrow();
  });
});

describe("mindfulness topics and symbol", () => {
  it("has the three new topics with labels", () => {
    expect(TOPICS).toEqual(expect.arrayContaining(["MOVEMENT", "FRESH_AIR", "SOCIAL"]));
    expect([TOPIC_LABELS.MOVEMENT, TOPIC_LABELS.FRESH_AIR, TOPIC_LABELS.SOCIAL]).toEqual(["Bewegung", "Frische Luft", "Soziale Kontakte"]);
  });

  it("stores ratings for the new topics", async () => {
    await saveCheckin(f.userA, f.familyA, {
      profileId: f.profileA, date: "2026-11-16",
      ratings: [{ topic: "MOVEMENT", rating: 4 }, { topic: "FRESH_AIR", rating: 5 }, { topic: "SOCIAL", rating: 2 }],
    }, app);
    const rows = await listEntries(f.userA, f.familyA, { from: "2026-11-16", to: "2026-11-16", profileId: f.profileA }, app);
    expect(rows.map((r) => `${r.topic}:${r.rating}`).sort()).toEqual(["FRESH_AIR:5", "MOVEMENT:4", "SOCIAL:2"]);
  });

  it("defaults to emoji, switches to circles without touching the visibility, and back", async () => {
    expect((await getPref(f.userBoth, f.familyA, app)).symbol).toBe("EMOJI");
    await savePref(f.userBoth, f.familyA, { visibility: "SELECTED", viewerIds: [f.userA] }, app);
    await saveSymbol(f.userBoth, f.familyA, "CIRCLE", app);
    const p = await getPref(f.userBoth, f.familyA, app);
    expect([p.symbol, p.visibility, p.viewerIds]).toEqual(["CIRCLE", "SELECTED", [f.userA]]);
    // saving the visibility keeps the symbol
    await savePref(f.userBoth, f.familyA, { visibility: "FAMILY" }, app);
    expect((await getPref(f.userBoth, f.familyA, app)).symbol).toBe("CIRCLE");
    // the setting is per user
    expect((await getPref(f.userA, f.familyA, app)).symbol).toBe("EMOJI");
    await saveSymbol(f.userBoth, f.familyA, "EMOJI", app);
    expect((await getPref(f.userBoth, f.familyA, app)).symbol).toBe("EMOJI");
  });

  it("rejects unknown symbols in the service and in the database", async () => {
    await expect(saveSymbol(f.userA, f.familyA, "<b>", app)).rejects.toThrow();
    await expect(admin.mindfulnessPref.update({ where: { familyId_userId: { familyId: f.familyA, userId: f.userBoth } }, data: { symbol: "X" } })).rejects.toThrow();
  });

  it("has a pastel scale red to blue and a text for every rating", () => {
    expect(Object.values(CIRCLE_COLORS).map((c) => c.name)).toEqual(["rot", "orange", "gelb", "grün", "blau"]);
    expect(ratingText(1)).toBe("1 von 5 (schlecht)");
    expect(ratingText(5)).toBe("5 von 5 (super)");
  });
});

describe("deleting routines", () => {
  it("deletes the routine with all its occurrences, past and future", async () => {
    const now = new Date("2026-11-16T08:00:00Z");
    const r = await createRoutine(f.userA, f.familyA, { title: "Pflanzen gießen", freq: "DAILY", startDate: "2026-11-16", assigneeIds: [f.profileA] }, app, now);
    const before = await admin.routineOccurrence.count({ where: { routineId: r.id } });
    expect(before).toBeGreaterThan(0);
    await admin.routineOccurrence.updateMany({ where: { routineId: r.id, date: new Date("2026-11-16") }, data: { status: "DONE" } });
    await deleteRoutine(f.userBoth, f.familyA, r.id, app);
    expect(await admin.routine.count({ where: { id: r.id } })).toBe(0);
    expect(await admin.routineOccurrence.count({ where: { routineId: r.id } })).toBe(0);
    const occ = await listOccurrences(f.userA, f.familyA, "2026-11-16", "2026-11-30", app);
    expect(occ.some((o) => o.routineId === r.id)).toBe(false);
  });

  it("cannot delete a routine of another family or an unknown one", async () => {
    await expect(deleteRoutine(f.userA, f.familyA, f.routineB, app)).rejects.toBeInstanceOf(NotFoundError);
    await expect(deleteRoutine(f.userA, f.familyA, "gibt-es-nicht", app)).rejects.toBeInstanceOf(NotFoundError);
    expect(await admin.routine.count({ where: { id: f.routineB } })).toBe(1);
  });
});

describe("wish list share links", () => {
  let listId = "";
  let token = "";
  beforeAll(async () => {
    const l = await createWishlist(f.userA, f.familyA, { title: "Anna Geburtstag", profileId: f.profileA, visibility: "FAMILY", surprise: true }, app);
    listId = l.id;
    const w = await createWish(f.userA, f.familyA, listId, { title: "Fahrrad <rot>", description: "28 Zoll", url: "https://example.test/rad", priority: 1, note: "nur intern" }, app);
    await createWish(f.userA, f.familyA, listId, { title: "Buch", priority: 3 }, app);
    await admin.wish.create({ data: { familyId: f.familyA, listId, title: "Schon erhalten", received: true, createdById: f.userA } });
    await reserveWish(f.userBoth, f.familyA, w.id, app);
  });

  it("creates a 256 bit token and stores only its hash", async () => {
    token = await createShare(f.userA, f.familyA, listId, app);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const row = await admin.wishlistShare.findUniqueOrThrow({ where: { listId } });
    expect(row.tokenHash).toBe(hashToken(token));
    expect(JSON.stringify(row)).not.toContain(token);
    expect(await shareInfo(f.userA, f.familyA, listId, app)).not.toBeNull();
  });

  it("shows only the first name and the open wishes, no reservations, notes or authors", async () => {
    const v = await resolveShare(token, app);
    expect(v).not.toBeNull();
    expect(v!.ownerName).toBe("Anna");
    expect(v!.wishes.map((w) => w.title)).toEqual(["Fahrrad <rot>", "Buch"]);
    expect(v!.wishes[0]).toEqual({ title: "Fahrrad <rot>", description: "28 Zoll", url: "https://example.test/rad", imageUrl: null, priceCents: null, priority: 1, occasion: "ANY" });
    const json = JSON.stringify(v);
    for (const leak of ["nur intern", "Bodo", "Muster", "reserv", f.userA, f.userBoth, "Anna Geburtstag", "Schon erhalten"]) expect(json).not.toContain(leak);
  });

  it("renders escaped HTML without reservation hints", () => {
    const html = renderSharedList({ ownerName: "Anna", wishes: [{ title: "<img src=x onerror=alert(1)>", description: null, url: "javascript:alert(1)", priceCents: 1999, priority: 1, occasion: "BIRTHDAY" }] });
    expect(html).not.toContain("<img src=x");
    expect(html).toContain(esc("<img src=x onerror=alert(1)>"));
    expect(html).not.toContain("javascript:");
    expect(html).toContain("noindex");
    expect(html).not.toContain("<script");
  });

  it("offers an https image link and drops other schemes", () => {
    const html = renderSharedList({ ownerName: "Anna", wishes: [
      { title: "Roller", description: null, url: null, imageUrl: "https://example.org/roller.jpg", priceCents: null, priority: 1, occasion: "ANY" },
      { title: "Ball", description: null, url: null, imageUrl: "javascript:alert(1)", priceCents: null, priority: 1, occasion: "ANY" },
    ] });
    expect(html).toContain('href="https://example.org/roller.jpg"');
    expect(html.match(/Bild ansehen/g)).toHaveLength(1);
    expect(html).not.toContain("javascript:");
  });

  it("returns nothing for malformed or unknown tokens", async () => {
    expect(await resolveShare("", app)).toBeNull();
    expect(await resolveShare("x".repeat(43), app)).toBeNull();
    expect(await resolveShare(`${token}x`, app)).toBeNull();
    expect(await resolveShare("../../etc/passwd", app)).toBeNull();
  });

  it("a new link replaces the old one", async () => {
    const old = token;
    token = await createShare(f.userA, f.familyA, listId, app);
    expect(token).not.toBe(old);
    expect(await resolveShare(old, app)).toBeNull();
    expect(await resolveShare(token, app)).not.toBeNull();
    expect(await admin.wishlistShare.count({ where: { listId } })).toBe(1);
  });

  it("only someone who may edit the list can share or revoke", async () => {
    // userBoth is a plain member, neither creator nor wisher
    await expect(createShare(f.userBoth, f.familyA, listId, app)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(revokeShare(f.userBoth, f.familyA, listId, app)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(createShare(f.userB, f.familyB, listId, app)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("row level security keeps share rows inside the family", async () => {
    const seen = await app.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.user_id', ${f.userB}, true)`;
      await tx.$executeRaw`SELECT set_config('app.family_id', ${f.familyB}, true)`;
      return tx.wishlistShare.findMany({ where: { listId } });
    });
    expect(seen).toHaveLength(0);
    const forged = app.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.user_id', ${f.userB}, true)`;
      await tx.$executeRaw`SELECT set_config('app.family_id', ${f.familyB}, true)`;
      return tx.wishlistShare.create({ data: { familyId: f.familyA, listId, tokenHash: "a".repeat(64), createdById: f.userB } });
    });
    await expect(forged).rejects.toThrow();
  });

  it("the app role cannot read share rows without context", async () => {
    expect(await app.wishlistShare.count()).toBe(0);
  });

  it("gives nothing while the wishes module is off", async () => {
    await setModule(f.userA, f.familyA, "wishes", false, app);
    expect(await resolveShare(token, app)).toBeNull();
    await expect(createShare(f.userA, f.familyA, listId, app)).rejects.toBeInstanceOf(ModuleOffError);
    await setModule(f.userA, f.familyA, "wishes", true, app);
    expect(await resolveShare(token, app)).not.toBeNull();
  });

  it("revoking ends the link", async () => {
    await revokeShare(f.userA, f.familyA, listId, app);
    expect(await resolveShare(token, app)).toBeNull();
    expect(await shareInfo(f.userA, f.familyA, listId, app)).toBeNull();
  });

  it("a link dies when its creator leaves the family or the list is deleted", async () => {
    token = await createShare(f.userA, f.familyA, listId, app);
    await admin.familyMembership.update({ where: { familyId_userId: { familyId: f.familyA, userId: f.userA } }, data: { role: "OWNER" } });
    const tmp = await admin.user.create({ data: { id: `u-tmp-${listId}`, name: "Tmp", email: `tmp-${listId}@example.test` } });
    await admin.familyMembership.create({ data: { familyId: f.familyA, userId: tmp.id, role: "ADMIN" } });
    // the share row's creator is replaced by a member who then leaves
    await admin.wishlistShare.update({ where: { listId }, data: { createdById: tmp.id } });
    expect(await resolveShare(token, app)).not.toBeNull();
    await admin.familyMembership.delete({ where: { familyId_userId: { familyId: f.familyA, userId: tmp.id } } });
    expect(await resolveShare(token, app)).toBeNull();
    await admin.user.delete({ where: { id: tmp.id } });
    token = await createShare(f.userA, f.familyA, listId, app);
    await admin.wishlist.delete({ where: { id: listId } });
    expect(await resolveShare(token, app)).toBeNull();
    expect(await admin.wishlistShare.count({ where: { listId } })).toBe(0);
  });
});
