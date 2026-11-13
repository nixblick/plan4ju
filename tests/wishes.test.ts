import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, app, cleanup, seed, type Fixture } from "./helpers";
import { ConflictError, ForbiddenError, NotFoundError } from "../src/server/errors";
import { easterSunday, formatPrice, httpsUrl, nextListOccasion, nextOccasion, parsePrice } from "../src/lib/wishes";
import { deleteBirthday } from "../src/server/services/birthdays";
import {
  createWish, createWishlist, deleteWish, deleteWishlist, getWishlist, listWishlists, releaseWish, reserveWish, setReservationGiven,
  setWishReceived, updateWish, updateWishlist, wishlistsByBirthday,
} from "../src/server/services/wishes";

let f: Fixture;
let profileBoth = "";
let childA = "";
let listB = "";
let wishB = "";
beforeAll(async () => {
  f = await seed();
  profileBoth = (await admin.familyProfile.create({ data: { familyId: f.familyA, displayName: "Bodo Muster", userId: f.userBoth } })).id;
  childA = (await admin.familyProfile.create({ data: { familyId: f.familyA, displayName: "Kim Muster", isChild: true } })).id;
  const l = await admin.wishlist.create({ data: { familyId: f.familyB, profileId: f.profileB, title: "Geheime Liste B", createdById: f.userB } });
  listB = l.id;
  wishB = (await admin.wish.create({ data: { familyId: f.familyB, listId: l.id, title: "Geheimer Wunsch B", createdById: f.userB } })).id;
});
afterAll(async () => {
  await cleanup(f);
  await app.$disconnect();
  await admin.$disconnect();
});

/** Raw app-role transaction with a given context (RLS applies, no service logic). */
function raw<T>(familyId: string, userId: string, fn: (tx: Parameters<Parameters<typeof app.$transaction>[0]>[0]) => Promise<T>) {
  return app.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.user_id', ${userId}, true)`;
    await tx.$executeRaw`SELECT set_config('app.family_id', ${familyId}, true)`;
    return fn(tx);
  });
}

describe("helpers", () => {
  it("accepts only https links without user info", () => {
    expect(httpsUrl("https://example.org/x?y=1")).toBe("https://example.org/x?y=1");
    expect(httpsUrl("http://example.org")).toBeNull();
    expect(httpsUrl("javascript:alert(1)")).toBeNull();
    expect(httpsUrl("https://user:pw@example.org")).toBeNull();
    expect(httpsUrl("")).toBeNull();
  });

  it("parses and formats prices in cents", () => {
    expect(parsePrice("12,99")).toBe(1299);
    expect(parsePrice("12.5")).toBe(1250);
    expect(parsePrice("1.299,00 €")).toBe(129900);
    expect(parsePrice("")).toBeNull();
    expect(parsePrice("abc")).toBeNaN();
    expect(formatPrice(1299)).toBe("12,99 €");
  });

  it("computes the next occasion", () => {
    expect(easterSunday(2027)).toBe("2027-03-28");
    expect(easterSunday(2026)).toBe("2026-04-05");
    expect(nextOccasion("CHRISTMAS", "2026-12-25")).toBe("2027-12-24");
    expect(nextOccasion("EASTER", "2026-11-13")).toBe("2027-03-28");
    expect(nextOccasion("BIRTHDAY", "2026-11-13", { month: 1, day: 5 })).toBe("2027-01-05");
    expect(nextOccasion("BIRTHDAY", "2026-11-13")).toBeNull();
    expect(nextOccasion("ANY", "2026-11-13")).toBeNull();
    expect(nextListOccasion(["CHRISTMAS", "ANY"], "2026-11-13", { month: 12, day: 1 })).toEqual({ occasion: "BIRTHDAY", date: "2026-12-01" });
    expect(nextListOccasion(["ANY"], "2026-11-13")).toBeNull();
  });
});

describe("lists and wishes", () => {
  let annaList = "";
  let wish = "";

  it("creates a list for an own profile with wishes; https only", async () => {
    annaList = (await createWishlist(f.userA, f.familyA, { title: "Annas Wünsche", profileId: f.profileA })).id;
    wish = (await createWish(f.userA, f.familyA, annaList, { title: "Buch", url: "https://example.org/buch", priceCents: 1999, priority: 1, occasion: "CHRISTMAS" })).id;
    await expect(createWish(f.userA, f.familyA, annaList, { title: "x", url: "http://example.org" })).rejects.toThrow();
    await expect(createWish(f.userA, f.familyA, annaList, { title: "x", imageUrl: "data:image/png;base64,AA" })).rejects.toThrow();
    const l = await getWishlist(f.userA, f.familyA, annaList);
    expect(l.ownerName).toBe("Anna Muster");
    expect(l.wishes[0]).toMatchObject({ title: "Buch", priceCents: 1999, priority: 1, occasion: "CHRISTMAS" });
  });

  it("needs a profile or a person name, not both", async () => {
    await expect(createWishlist(f.userA, f.familyA, { title: "x" })).rejects.toThrow();
    await expect(createWishlist(f.userA, f.familyA, { title: "x", profileId: f.profileA, personName: "Oma" })).rejects.toThrow();
    const oma = await createWishlist(f.userA, f.familyA, { title: "Omas Liste", personName: "Oma Muster" });
    expect((await getWishlist(f.userBoth, f.familyA, oma.id)).ownerName).toBe("Oma Muster");
  });

  it("only creator or wishing person edits; others are forbidden", async () => {
    await expect(createWish(f.userBoth, f.familyA, annaList, { title: "fremd" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(updateWish(f.userBoth, f.familyA, wish, { title: "geändert" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(deleteWish(f.userBoth, f.familyA, wish)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(updateWishlist(f.userBoth, f.familyA, annaList, { title: "x", profileId: f.profileA })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(deleteWishlist(f.userBoth, f.familyA, annaList)).rejects.toBeInstanceOf(ForbiddenError);
    await updateWish(f.userA, f.familyA, wish, { title: "Buch, gebunden", url: "https://example.org/buch", priceCents: 2499, priority: 1, occasion: "CHRISTMAS" });
    expect((await getWishlist(f.userBoth, f.familyA, annaList)).wishes[0]!.title).toBe("Buch, gebunden");
  });

  it("an admin may edit the list of a child without login", async () => {
    const kim = await createWishlist(f.userBoth, f.familyA, { title: "Kims Liste", profileId: childA });
    const w = await createWish(f.userA, f.familyA, kim.id, { title: "Bagger" });
    expect((await getWishlist(f.userBoth, f.familyA, kim.id)).wishes.map((x) => x.id)).toEqual([w.id]);
  });

  it("a private list is invisible to other members, also at database level", async () => {
    const p = await createWishlist(f.userA, f.familyA, { title: "Nur für mich", profileId: f.profileA, visibility: "PRIVATE" });
    await createWish(f.userA, f.familyA, p.id, { title: "Geheimtipp" });
    expect((await listWishlists(f.userA, f.familyA)).map((l) => l.id)).toContain(p.id);
    expect((await listWishlists(f.userBoth, f.familyA)).map((l) => l.id)).not.toContain(p.id);
    await expect(getWishlist(f.userBoth, f.familyA, p.id)).rejects.toBeInstanceOf(NotFoundError);
    await raw(f.familyA, f.userBoth, async (tx) => {
      expect(await tx.wishlist.findUnique({ where: { id: p.id } })).toBeNull();
      expect(await tx.wish.findMany({ where: { listId: p.id } })).toHaveLength(0);
    });
  });

  it("only the creator may make a list private", async () => {
    const kim = await createWishlist(f.userA, f.familyA, { title: "Kim 2", profileId: childA });
    await expect(updateWishlist(f.userBoth, f.familyA, kim.id, { title: "Kim 2", profileId: childA, visibility: "PRIVATE" })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("links a birthday, lists it per birthday and survives deleting the birthday", async () => {
    const b = await admin.birthday.create({ data: { familyId: f.familyA, name: "Anna Muster", month: 2, day: 3, createdById: f.userA } });
    const l = await createWishlist(f.userA, f.familyA, { title: "Geburtstag", profileId: f.profileA, birthdayId: b.id });
    expect((await wishlistsByBirthday(f.userBoth, f.familyA)).get(b.id)).toEqual([{ id: l.id, title: "Geburtstag" }]);
    expect((await getWishlist(f.userA, f.familyA, l.id)).birthday).toMatchObject({ month: 2, day: 3 });
    await expect(createWishlist(f.userA, f.familyA, { title: "x", profileId: f.profileA, birthdayId: f.birthdayB })).rejects.toBeInstanceOf(NotFoundError);
    await deleteBirthday(f.userA, f.familyA, b.id);
    expect((await getWishlist(f.userA, f.familyA, l.id)).birthday).toBeNull();
  });
});

describe("surprise protection", () => {
  let list = "";
  let wish = "";

  beforeAll(async () => {
    list = (await createWishlist(f.userA, f.familyA, { title: "Überraschung", profileId: f.profileA })).id;
    wish = (await createWish(f.userA, f.familyA, list, { title: "Fahrrad" })).id;
  });

  it("another member reserves; the wishing person sees nothing and the wish row stays untouched", async () => {
    const before = await admin.wish.findUniqueOrThrow({ where: { id: wish } });
    await reserveWish(f.userBoth, f.familyA, wish);
    const after = await admin.wish.findUniqueOrThrow({ where: { id: wish } });
    expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());

    const third = (await getWishlist(f.userBoth, f.familyA, list)).wishes[0]!;
    expect(third.reservation).toEqual({ state: "reserved", byMe: true, byName: "Bodo Muster", given: false });

    const own = await getWishlist(f.userA, f.familyA, list);
    expect(own.iAmWisher).toBe(true);
    expect(own.wishes[0]!.reservation).toBeNull();
    expect(JSON.stringify(own)).not.toContain("Bodo");
    expect(JSON.stringify(await listWishlists(f.userA, f.familyA))).not.toContain("reserved");
  });

  it("the wishing person cannot see or insert reservations at database level", async () => {
    await raw(f.familyA, f.userA, async (tx) => {
      expect(await tx.wishReservation.findMany({ where: { wishId: wish } })).toHaveLength(0);
      expect(await tx.wishReservation.count()).toBe(0);
    });
    const w2 = await createWish(f.userA, f.familyA, list, { title: "Roller" });
    await expect(raw(f.familyA, f.userA, (tx) => tx.wishReservation.create({ data: { familyId: f.familyA, wishId: w2.id, reservedById: f.userA } }))).rejects.toThrow();
    // nobody may reserve in someone else's name
    await expect(raw(f.familyA, f.userBoth, (tx) => tx.wishReservation.create({ data: { familyId: f.familyA, wishId: w2.id, reservedById: f.userA } }))).rejects.toThrow();
  });

  it("the wishing person is refused without learning whether it is reserved", async () => {
    await expect(reserveWish(f.userA, f.familyA, wish)).rejects.toBeInstanceOf(ForbiddenError);
    const free = await createWish(f.userA, f.familyA, list, { title: "Ball" });
    await expect(reserveWish(f.userA, f.familyA, free.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(releaseWish(f.userA, f.familyA, wish)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("a second reservation conflicts; only the reserver releases or marks as given", async () => {
    const other = await admin.user.create({ data: { id: `u-other-${Date.now()}`, name: "Muster Other", email: `other-${Date.now()}@example.test` } });
    await admin.familyMembership.create({ data: { familyId: f.familyA, userId: other.id } });
    try {
      await expect(reserveWish(other.id, f.familyA, wish)).rejects.toBeInstanceOf(ConflictError);
      expect((await getWishlist(other.id, f.familyA, list)).wishes.find((w) => w.id === wish)!.reservation).toMatchObject({ state: "reserved", byMe: false });
      await expect(releaseWish(other.id, f.familyA, wish)).rejects.toBeInstanceOf(NotFoundError);
      await expect(setReservationGiven(other.id, f.familyA, wish, true)).rejects.toBeInstanceOf(NotFoundError);
    } finally {
      await admin.user.delete({ where: { id: other.id } });
    }
    await setReservationGiven(f.userBoth, f.familyA, wish, true);
    expect((await getWishlist(f.userBoth, f.familyA, list)).wishes.find((w) => w.id === wish)!.reservation).toMatchObject({ given: true });
    expect((await getWishlist(f.userA, f.familyA, list)).wishes.find((w) => w.id === wish)!.reservation).toBeNull();
    await releaseWish(f.userBoth, f.familyA, wish);
    expect((await getWishlist(f.userBoth, f.familyA, list)).wishes.find((w) => w.id === wish)!.reservation).toEqual({ state: "free" });
  });

  it("the wishing person cannot switch off surprise mode or move the list away", async () => {
    await reserveWish(f.userBoth, f.familyA, wish);
    await expect(updateWishlist(f.userA, f.familyA, list, { title: "Überraschung", profileId: f.profileA, surprise: false })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(updateWishlist(f.userA, f.familyA, list, { title: "Überraschung", profileId: profileBoth })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(updateWishlist(f.userA, f.familyA, list, { title: "Überraschung", personName: "Jemand" })).rejects.toBeInstanceOf(ForbiddenError);
    await updateWishlist(f.userA, f.familyA, list, { title: "Überraschung neu", profileId: f.profileA });
    const own = await getWishlist(f.userA, f.familyA, list);
    expect(own.surprise).toBe(true);
    expect(own.wishes.find((w) => w.id === wish)!.reservation).toBeNull();
  });

  it("without surprise mode the wishing person sees reserved, but not by whom", async () => {
    const open = await createWishlist(f.userA, f.familyA, { title: "Offen", profileId: f.profileA, surprise: false });
    const w = await createWish(f.userA, f.familyA, open.id, { title: "Ball" });
    const free = await createWish(f.userA, f.familyA, open.id, { title: "Kreisel" });
    await reserveWish(f.userBoth, f.familyA, w.id);
    const own = await getWishlist(f.userA, f.familyA, open.id);
    expect(own.wishes.find((x) => x.id === w.id)!.reservation).toEqual({ state: "reserved-anonymous" });
    expect(own.wishes.find((x) => x.id === free.id)!.reservation).toEqual({ state: "free" });
    expect(JSON.stringify(own)).not.toContain("Bodo");
    // switching surprise back on is allowed and hides it again
    await updateWishlist(f.userA, f.familyA, open.id, { title: "Offen", profileId: f.profileA, surprise: true });
    expect((await getWishlist(f.userA, f.familyA, open.id)).wishes.find((x) => x.id === w.id)!.reservation).toBeNull();
  });

  it("received is set by the wishing person and visible to everyone", async () => {
    await setWishReceived(f.userA, f.familyA, wish, true);
    expect((await getWishlist(f.userBoth, f.familyA, list)).wishes.find((w) => w.id === wish)!.received).toBe(true);
    await expect(setWishReceived(f.userBoth, f.familyA, wish, false)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("tenant isolation", () => {
  it("foreign list and wish ids are not found", async () => {
    await expect(getWishlist(f.userA, f.familyA, listB)).rejects.toBeInstanceOf(NotFoundError);
    await expect(createWish(f.userA, f.familyA, listB, { title: "x" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(updateWish(f.userA, f.familyA, wishB, { title: "x" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(deleteWish(f.userA, f.familyA, wishB)).rejects.toBeInstanceOf(NotFoundError);
    await expect(reserveWish(f.userA, f.familyA, wishB)).rejects.toBeInstanceOf(NotFoundError);
    await expect(releaseWish(f.userA, f.familyA, wishB)).rejects.toBeInstanceOf(NotFoundError);
    await expect(setWishReceived(f.userA, f.familyA, wishB, true)).rejects.toBeInstanceOf(NotFoundError);
    await expect(deleteWishlist(f.userA, f.familyA, listB)).rejects.toBeInstanceOf(NotFoundError);
    await expect(createWishlist(f.userA, f.familyA, { title: "x", profileId: f.profileB })).rejects.toBeInstanceOf(NotFoundError);
    expect(JSON.stringify(await listWishlists(f.userA, f.familyA))).not.toContain("Geheimer Wunsch B");
  });

  it("a non-member is forbidden", async () => {
    await expect(listWishlists(f.userNone, f.familyA)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(reserveWish(f.userNone, f.familyB, wishB)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("raw access of family A sees no rows of family B", async () => {
    await raw(f.familyA, f.userA, async (tx) => {
      expect(await tx.wishlist.findUnique({ where: { id: listB } })).toBeNull();
      expect(await tx.wish.findUnique({ where: { id: wishB } })).toBeNull();
      expect((await tx.wish.updateMany({ where: { id: wishB }, data: { title: "gehackt" } })).count).toBe(0);
    });
    await expect(raw(f.familyA, f.userA, (tx) => tx.wish.create({ data: { familyId: f.familyB, listId: listB, title: "x", createdById: f.userA } }))).rejects.toThrow();
  });
});
