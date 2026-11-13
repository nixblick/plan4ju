import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, app, cleanup, seed, type Fixture } from "./helpers";
import { createFamilyWithOwnerInvitation } from "../src/server/admin";
import { ConflictError, ForbiddenError, InvalidInvitationError, NotFoundError } from "../src/server/errors";
import { hashToken } from "../src/server/tokens";
import {
  acceptInvitation, createInvitation, listInvitations, lookupInvitation, revokeInvitation,
} from "../src/server/services/invitations";
import {
  addChildProfile, changeMemberRole, deleteChildProfile, listMembers, listProfiles, removeMember, renameProfile,
} from "../src/server/services/members";
import { withFamily } from "../src/server/tenant";

let f: Fixture;
let adminUser: string; // ADMIN in family A
let memberUser: string; // MEMBER in family A
const extraUsers: string[] = [];
const sfx = Math.random().toString(36).slice(2, 8);
const mail = (k: string) => `${k}-${sfx}@example.test`;

async function newUser(key: string, email = mail(key)) {
  const u = await admin.user.create({ data: { id: `u-${key}-${sfx}`, name: `Muster ${key}`, email } });
  extraUsers.push(u.id);
  return u;
}

beforeAll(async () => {
  f = await seed();
  adminUser = (await newUser("adm")).id;
  memberUser = (await newUser("mem")).id;
  await admin.familyMembership.createMany({
    data: [
      { familyId: f.familyA, userId: adminUser, role: "ADMIN" },
      { familyId: f.familyA, userId: memberUser, role: "MEMBER" },
    ],
  });
  await admin.familyProfile.createMany({
    data: [
      { familyId: f.familyA, userId: adminUser, displayName: "Admin Muster" },
      { familyId: f.familyA, userId: memberUser, displayName: "Mitglied Muster" },
    ],
  });
});
afterAll(async () => {
  await cleanup(f);
  await admin.user.deleteMany({ where: { id: { in: extraUsers } } });
  await app.$disconnect();
  await admin.$disconnect();
});

const expiresOf = (token: string) =>
  admin.familyInvitation.findUniqueOrThrow({ where: { tokenHash: hashToken(token) } });

describe("creating invitations", () => {
  it("OWNER creates a token valid for 7 days; only the hash is stored", async () => {
    const inv = await createInvitation(f.userA, f.familyA, { email: "Neu@Example.test", role: "MEMBER" });
    expect(inv.email).toBe("neu@example.test");
    expect(inv.token.length).toBeGreaterThanOrEqual(43);
    const row = await expiresOf(inv.token);
    expect(row.tokenHash).not.toBe(inv.token);
    expect(row.tokenHash).toBe(hashToken(inv.token));
    const days = (row.expiresAt.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.99);
    expect(days).toBeLessThan(7.01);
    expect(JSON.stringify(row)).not.toContain(inv.token);
  });

  it("MEMBER may not invite", async () => {
    await expect(createInvitation(memberUser, f.familyA, { email: "x@example.test" })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("ADMIN may invite members but not grant ADMIN", async () => {
    await expect(createInvitation(adminUser, f.familyA, { email: mail("byadmin"), role: "MEMBER" })).resolves.toBeTruthy();
    await expect(createInvitation(adminUser, f.familyA, { email: mail("byadmin2"), role: "ADMIN" })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("nobody can invite into a family they do not belong to", async () => {
    await expect(createInvitation(f.userB, f.familyA, { email: "x@example.test" })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("refuses existing members and bad input", async () => {
    await expect(createInvitation(f.userA, f.familyA, { email: `mem-${sfx}@example.test` })).rejects.toBeInstanceOf(ConflictError);
    await expect(createInvitation(f.userA, f.familyA, { email: "kein-mail" })).rejects.toThrow();
    // @ts-expect-error OWNER is not offered through the form
    await expect(createInvitation(f.userA, f.familyA, { email: "o@example.test", role: "OWNER" })).rejects.toThrow();
  });

  it("lists pending invitations for admins only and only of the own family", async () => {
    const mine = await listInvitations(f.userA, f.familyA);
    expect(mine.length).toBeGreaterThan(0);
    expect(await listInvitations(adminUser, f.familyA)).toHaveLength(mine.length);
    await expect(listInvitations(memberUser, f.familyA)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(listInvitations(f.userA, f.familyB)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("looking up and accepting", () => {
  it("unknown token reveals nothing", async () => {
    expect(await lookupInvitation("nope")).toEqual({ status: "unknown" });
    expect(await lookupInvitation("")).toEqual({ status: "unknown" });
  });

  it("valid token shows family and address; accepting joins once", async () => {
    const u = await newUser("joiner");
    const inv = await createInvitation(f.userA, f.familyA, { email: u.email, role: "MEMBER" });
    const info = await lookupInvitation(inv.token);
    expect(info.status).toBe("valid");
    expect(info.email).toBe(u.email);
    expect(info.accountExists).toBe(true);

    expect(await acceptInvitation(u.id, inv.token)).toBe(f.familyA);
    const m = await admin.familyMembership.findUniqueOrThrow({ where: { familyId_userId: { familyId: f.familyA, userId: u.id } } });
    expect(m.role).toBe("MEMBER");
    const p = await admin.familyProfile.findFirstOrThrow({ where: { familyId: f.familyA, userId: u.id } });
    expect(p.displayName).toBe(u.name);
    expect((await lookupInvitation(inv.token)).status).toBe("accepted");
    // single use
    await expect(acceptInvitation(u.id, inv.token)).rejects.toBeInstanceOf(InvalidInvitationError);
  });

  it("concurrent acceptance succeeds exactly once", async () => {
    const u = await newUser("race");
    const inv = await createInvitation(f.userA, f.familyA, { email: u.email });
    const res = await Promise.allSettled(Array.from({ length: 6 }, () => acceptInvitation(u.id, inv.token)));
    expect(res.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await admin.familyMembership.count({ where: { familyId: f.familyA, userId: u.id } })).toBe(1);
  });

  it("another user cannot use someone else's invitation", async () => {
    const inv = await createInvitation(f.userA, f.familyA, { email: mail("target") });
    await expect(acceptInvitation(f.userNone, inv.token)).rejects.toBeInstanceOf(InvalidInvitationError);
    expect(await admin.familyMembership.count({ where: { familyId: f.familyA, userId: f.userNone } })).toBe(0);
    expect((await lookupInvitation(inv.token)).status).toBe("valid");
  });

  it("the accepting user must be the one in the database context", async () => {
    const u = await newUser("ctx");
    const inv = await createInvitation(f.userA, f.familyA, { email: u.email });
    await expect(
      app.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.user_id', ${f.userNone}, true)`;
        return tx.$queryRaw`SELECT app_invitation_accept(${hashToken(inv.token)}, ${u.id})`;
      }),
    ).rejects.toThrow(/wrong user/);
  });

  it("expired invitations are refused", async () => {
    const u = await newUser("late");
    const inv = await createInvitation(f.userA, f.familyA, { email: u.email });
    await admin.familyInvitation.update({ where: { tokenHash: hashToken(inv.token) }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await lookupInvitation(inv.token)).status).toBe("expired");
    await expect(acceptInvitation(u.id, inv.token)).rejects.toBeInstanceOf(InvalidInvitationError);
    const listed = (await listInvitations(f.userA, f.familyA)).find((i) => i.id === inv.id);
    expect(listed?.expired).toBe(true);
  });

  it("revoked invitations are refused", async () => {
    const u = await newUser("revoked");
    const inv = await createInvitation(f.userA, f.familyA, { email: u.email });
    await revokeInvitation(adminUser, f.familyA, inv.id);
    expect((await lookupInvitation(inv.token)).status).toBe("revoked");
    await expect(acceptInvitation(u.id, inv.token)).rejects.toBeInstanceOf(InvalidInvitationError);
    await expect(revokeInvitation(f.userA, f.familyA, inv.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("only admins revoke, and never across families", async () => {
    const inv = await createInvitation(f.userA, f.familyA, { email: mail("rv") });
    await expect(revokeInvitation(memberUser, f.familyA, inv.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(revokeInvitation(f.userB, f.familyB, inv.id)).rejects.toBeInstanceOf(NotFoundError);
    expect((await lookupInvitation(inv.token)).status).toBe("valid");
  });

  it("an OWNER invitation made by the instance admin gives the OWNER role", async () => {
    const u = await newUser("founder");
    const r = await createFamilyWithOwnerInvitation(admin, { name: "Familie Gründer", ownerEmail: u.email });
    try {
      expect(await acceptInvitation(u.id, r.token)).toBe(r.familyId);
      const m = await admin.familyMembership.findFirstOrThrow({ where: { familyId: r.familyId, userId: u.id } });
      expect(m.role).toBe("OWNER");
      // the new owner can work in the new family
      expect(await withFamily(u.id, r.familyId, async (c) => c.role)).toBe("OWNER");
    } finally {
      await admin.family.delete({ where: { id: r.familyId } });
    }
  });

  it("the app role cannot create families (instance administration only)", async () => {
    await expect(app.family.create({ data: { name: "Schwarzfamilie" } })).rejects.toThrow();
  });
});

describe("roles and rights", () => {
  it("members see names but no e-mail addresses; admins see them", async () => {
    const asMember = await listMembers(memberUser, f.familyA);
    expect(asMember.length).toBeGreaterThanOrEqual(3);
    expect(asMember.every((m) => m.email === null)).toBe(true);
    const asAdmin = await listMembers(adminUser, f.familyA);
    expect(asAdmin.every((m) => typeof m.email === "string")).toBe(true);
    await expect(listMembers(f.userB, f.familyA)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("only OWNER changes roles; ADMIN and MEMBER cannot", async () => {
    await expect(changeMemberRole(adminUser, f.familyA, memberUser, "ADMIN")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(changeMemberRole(memberUser, f.familyA, memberUser, "OWNER")).rejects.toBeInstanceOf(ForbiddenError);
    await changeMemberRole(f.userA, f.familyA, memberUser, "ADMIN");
    await changeMemberRole(f.userA, f.familyA, memberUser, "MEMBER");
  });

  it("the last OWNER can neither be demoted nor removed", async () => {
    await expect(changeMemberRole(f.userA, f.familyA, f.userA, "ADMIN")).rejects.toBeInstanceOf(ConflictError);
    await expect(removeMember(f.userA, f.familyA, f.userA)).rejects.toBeInstanceOf(ConflictError);
    expect(await admin.familyMembership.count({ where: { familyId: f.familyA, role: "OWNER" } })).toBe(1);
  });

  it("a member cannot raise their own role or remove others (also at database level)", async () => {
    await expect(removeMember(memberUser, f.familyA, adminUser)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      withFamily(memberUser, f.familyA, (ctx) =>
        ctx.tx.familyMembership.updateMany({ where: { userId: memberUser }, data: { role: "OWNER" } }),
      ),
    ).resolves.toEqual({ count: 0 });
    expect((await admin.familyMembership.findFirstOrThrow({ where: { familyId: f.familyA, userId: memberUser } })).role).toBe("MEMBER");
  });

  it("ADMIN removes plain members but not admins or owners", async () => {
    await expect(removeMember(adminUser, f.familyA, f.userA)).rejects.toBeInstanceOf(ForbiddenError);
    const victim = await newUser("victim");
    await admin.familyMembership.create({ data: { familyId: f.familyA, userId: victim.id } });
    await admin.familyProfile.create({ data: { familyId: f.familyA, userId: victim.id, displayName: "Opfer Muster" } });
    await removeMember(adminUser, f.familyA, victim.id);
    // access is gone immediately, the profile stays without the login link
    await expect(withFamily(victim.id, f.familyA, async () => 1)).rejects.toBeInstanceOf(ForbiddenError);
    const prof = await admin.familyProfile.findFirstOrThrow({ where: { familyId: f.familyA, displayName: "Opfer Muster" } });
    expect(prof.userId).toBeNull();
  });

  it("cannot touch members of another family by id", async () => {
    await expect(removeMember(f.userA, f.familyA, f.userB)).rejects.toBeInstanceOf(NotFoundError);
    expect(await admin.familyMembership.count({ where: { familyId: f.familyB, userId: f.userB } })).toBe(1);
  });

  it("child profiles: admins manage them, members cannot; no login attached", async () => {
    await expect(addChildProfile(memberUser, f.familyA, "Kind Muster")).rejects.toBeInstanceOf(ForbiddenError);
    const kid = await addChildProfile(adminUser, f.familyA, "  Kind Muster ");
    expect(kid).toMatchObject({ displayName: "Kind Muster", isChild: true });
    const profiles = await listProfiles(memberUser, f.familyA);
    expect(profiles.find((p) => p.id === kid.id)?.userId).toBeNull();
    await expect(renameProfile(memberUser, f.familyA, kid.id, "Neu")).rejects.toBeInstanceOf(ForbiddenError);
    await renameProfile(adminUser, f.familyA, kid.id, "Kind Beispiel");
    // login profiles cannot be deleted through the child endpoint
    await expect(deleteChildProfile(adminUser, f.familyA, f.profileA)).rejects.toBeInstanceOf(NotFoundError);
    await expect(deleteChildProfile(f.userB, f.familyB, kid.id)).rejects.toBeInstanceOf(NotFoundError);
    await deleteChildProfile(adminUser, f.familyA, kid.id);
  });

  it("members may rename their own profile only", async () => {
    const own = await admin.familyProfile.findFirstOrThrow({ where: { familyId: f.familyA, userId: memberUser } });
    await renameProfile(memberUser, f.familyA, own.id, "Mitglied Neu");
    await expect(renameProfile(memberUser, f.familyA, f.profileA, "Hack")).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("a child profile can be assigned to a task", async () => {
    const kid = await addChildProfile(adminUser, f.familyA, "Kind Aufgabe");
    await admin.taskAssignment.create({ data: { taskId: f.taskA, profileId: kid.id, familyId: f.familyA } });
    expect(await admin.taskAssignment.count({ where: { profileId: kid.id } })).toBe(1);
  });
});
