import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { admin, app, cleanup, seed, type Fixture } from "./helpers";
import { resetRateLimits } from "../src/server/ratelimit";
import { changeMemberRole, removeMember } from "../src/server/services/members";
import { createShare, createWishlist, resolveShare, updateWishlist } from "../src/server/services/wishes";
import { GET } from "../src/app/geteilt/wunschzettel/[token]/route";

// Release 0.9.1 (security): a share link lives only while its creator may edit the list, and failed
// lookups never block a valid link.

let f: Fixture;
let child = "";
beforeAll(async () => {
  f = await seed();
  await admin.family.update({ where: { id: f.familyA }, data: { moduleWishes: true } });
  child = (await admin.familyProfile.create({ data: { familyId: f.familyA, displayName: "Kind Muster", isChild: true } })).id;
});
afterEach(() => resetRateLimits());
afterAll(async () => {
  await cleanup(f);
  await app.$disconnect();
  await admin.$disconnect();
});

const role = (userId: string, r: "OWNER" | "ADMIN" | "MEMBER") =>
  admin.familyMembership.update({ where: { familyId_userId: { familyId: f.familyA, userId } }, data: { role: r } });

/** A list for the child profile, created by userA, shared by userBoth as ADMIN (edits unlinked profiles). */
async function childListSharedByAdmin() {
  const l = await createWishlist(f.userA, f.familyA, { title: "Kind Geburtstag", profileId: child, visibility: "FAMILY" }, app);
  await role(f.userBoth, "ADMIN");
  const token = await createShare(f.userBoth, f.familyA, l.id, app);
  expect(await resolveShare(token, app)).not.toBeNull();
  return { listId: l.id, token };
}

describe("share link follows the creator's edit right", () => {
  it("lookup: a demoted creator's link stops working even without the service", async () => {
    const { token } = await childListSharedByAdmin();
    await role(f.userBoth, "MEMBER");
    expect(await resolveShare(token, app)).toBeNull();
  });

  it("lookup: profile linked to someone else or list made private voids the link", async () => {
    const { listId, token } = await childListSharedByAdmin();
    await admin.wishlist.update({ where: { id: listId }, data: { profileId: f.profileA } });
    expect(await resolveShare(token, app)).toBeNull();
    await admin.wishlist.update({ where: { id: listId }, data: { profileId: child, visibility: "PRIVATE" } });
    expect(await resolveShare(token, app)).toBeNull();
    await admin.wishlist.update({ where: { id: listId }, data: { visibility: "FAMILY" } });
    expect(await resolveShare(token, app)).not.toBeNull();
    await role(f.userBoth, "MEMBER");
  });

  it("service: changing profile or visibility deletes the link", async () => {
    const { listId, token } = await childListSharedByAdmin();
    await updateWishlist(f.userA, f.familyA, listId, { title: "Kind Geburtstag", profileId: child, visibility: "FAMILY" }, app);
    expect(await resolveShare(token, app)).not.toBeNull(); // unchanged rights: the link stays
    await updateWishlist(f.userA, f.familyA, listId, { title: "Kind Geburtstag", profileId: f.profileA, visibility: "FAMILY" }, app);
    expect(await admin.wishlistShare.count({ where: { listId } })).toBe(0);
    const t2 = await createShare(f.userA, f.familyA, listId, app);
    await updateWishlist(f.userA, f.familyA, listId, { title: "Kind Geburtstag", profileId: f.profileA, visibility: "PRIVATE" }, app);
    expect(await resolveShare(t2, app)).toBeNull();
    expect(await admin.wishlistShare.count({ where: { listId } })).toBe(0);
    await role(f.userBoth, "MEMBER");
  });

  it("service: demoting or removing a member deletes their links", async () => {
    const { listId } = await childListSharedByAdmin();
    await changeMemberRole(f.userA, f.familyA, f.userBoth, "ADMIN", app); // no demotion: stays
    expect(await admin.wishlistShare.count({ where: { listId } })).toBe(1);
    await changeMemberRole(f.userA, f.familyA, f.userBoth, "MEMBER", app);
    expect(await admin.wishlistShare.count({ where: { listId } })).toBe(0);
    await role(f.userBoth, "ADMIN");
    await createShare(f.userBoth, f.familyA, listId, app);
    await removeMember(f.userA, f.familyA, f.userBoth, app);
    expect(await admin.wishlistShare.count({ where: { listId } })).toBe(0);
    await admin.familyMembership.create({ data: { familyId: f.familyA, userId: f.userBoth } });
  });
});

describe("share route miss limit", () => {
  const get = (token: string, ip?: string) =>
    GET(new Request(`http://x/geteilt/wunschzettel/${token}`, { headers: ip ? { "x-forwarded-for": ip } : {} }), { params: Promise.resolve({ token }) });
  const miss = (i: number) => `${"m".repeat(38)}${String(i).padStart(5, "0")}`;
  let token = "";
  beforeAll(async () => {
    const l = await createWishlist(f.userA, f.familyA, { title: "Route", profileId: f.profileA, visibility: "FAMILY" }, app);
    token = await createShare(f.userA, f.familyA, l.id, app);
  });

  it("counts only failed lookups per address; a valid link from that address still works", async () => {
    for (let i = 0; i < 30; i++) expect((await get(miss(i), "203.0.113.9")).status).toBe(404);
    expect((await get(miss(99), "203.0.113.9")).status).toBe(429);
    expect((await get(token, "203.0.113.9")).status).toBe(200);
    expect((await get(miss(98), "203.0.113.10")).status).toBe(404);
  });

  it("without a client address misses use a large global budget, never a small common pot", async () => {
    for (let i = 0; i < 100; i++) expect((await get(miss(i))).status).toBe(404);
    expect((await get(token)).status).toBe(200);
    for (let i = 100; i < 3000; i++) await get(miss(i));
    expect((await get(miss(3001))).status).toBe(429);
    expect((await get(token)).status).toBe(200);
  }, 120_000);
});
