import { z } from "zod";
import type { FamilyRole, PrismaClient } from "@prisma/client";
import { ConflictError, ForbiddenError, NotFoundError } from "../errors";
import { assertRole, atLeast, canManage } from "../permissions";
import { withFamily, type FamilyContext } from "../tenant";

/** Members of the active family. E-mail addresses are only visible to ADMIN and OWNER. */
export function listMembers(userId: string, familyId: string, client?: PrismaClient) {
  return withFamily(
    userId,
    familyId,
    async (ctx) => {
      const showEmail = atLeast(ctx.role, "ADMIN");
      const rows = await ctx.tx.familyMembership.findMany({
        where: { familyId },
        orderBy: { createdAt: "asc" },
        select: { userId: true, role: true, user: { select: { name: true, email: true } } },
      });
      return rows.map((m) => ({
        userId: m.userId,
        role: m.role,
        name: m.user.name,
        email: showEmail ? m.user.email : null,
        isSelf: m.userId === ctx.userId,
      }));
    },
    client,
  );
}

/** All people of the family: login members and child profiles. */
export function listProfiles(userId: string, familyId: string, client?: PrismaClient) {
  return withFamily(
    userId,
    familyId,
    (ctx) =>
      ctx.tx.familyProfile.findMany({
        where: { familyId },
        orderBy: { createdAt: "asc" },
        select: { id: true, displayName: true, isChild: true, userId: true },
      }),
    client,
  );
}

async function ownerCount(ctx: FamilyContext): Promise<number> {
  return ctx.tx.familyMembership.count({ where: { familyId: ctx.familyId, role: "OWNER" } });
}

const roleInput = z.enum(["OWNER", "ADMIN", "MEMBER"]);

/** Only an OWNER changes roles. The last OWNER cannot be demoted. */
export async function changeMemberRole(
  userId: string,
  familyId: string,
  targetUserId: string,
  role: FamilyRole,
  client?: PrismaClient,
) {
  const newRole = roleInput.parse(role);
  return withFamily(
    userId,
    familyId,
    async (ctx) => {
      assertRole(ctx, "OWNER");
      const target = await ctx.tx.familyMembership.findUnique({
        where: { familyId_userId: { familyId, userId: targetUserId } },
      });
      if (!target) throw new NotFoundError("Member not found");
      if (target.role === "OWNER" && newRole !== "OWNER" && (await ownerCount(ctx)) <= 1) {
        throw new ConflictError("A family needs at least one owner");
      }
      await ctx.tx.familyMembership.update({ where: { id: target.id }, data: { role: newRole } });
    },
    client,
  );
}

/**
 * OWNER removes anyone (not the last owner); ADMIN removes plain members only.
 * The person's profile stays (tasks keep their history) but loses the login link.
 */
export function removeMember(userId: string, familyId: string, targetUserId: string, client?: PrismaClient) {
  return withFamily(
    userId,
    familyId,
    async (ctx) => {
      assertRole(ctx, "ADMIN");
      const target = await ctx.tx.familyMembership.findUnique({
        where: { familyId_userId: { familyId, userId: targetUserId } },
      });
      if (!target) throw new NotFoundError("Member not found");
      if (!canManage(ctx.role, target.role)) throw new ForbiddenError("May not remove this member");
      if (target.role === "OWNER" && (await ownerCount(ctx)) <= 1) {
        throw new ConflictError("A family needs at least one owner");
      }
      await ctx.tx.familyMembership.delete({ where: { id: target.id } });
      await ctx.tx.familyProfile.updateMany({ where: { familyId, userId: targetUserId }, data: { userId: null } });
    },
    client,
  );
}

const nameInput = z.string().trim().min(1).max(60);

/** Child profiles have no login. OWNER and ADMIN manage them. */
export async function addChildProfile(userId: string, familyId: string, displayName: string, client?: PrismaClient) {
  const name = nameInput.parse(displayName);
  return withFamily(
    userId,
    familyId,
    async (ctx) => {
      assertRole(ctx, "ADMIN");
      return ctx.tx.familyProfile.create({
        data: { familyId, displayName: name, isChild: true },
        select: { id: true, displayName: true, isChild: true },
      });
    },
    client,
  );
}

export async function renameProfile(userId: string, familyId: string, profileId: string, displayName: string, client?: PrismaClient) {
  const name = nameInput.parse(displayName);
  return withFamily(
    userId,
    familyId,
    async (ctx) => {
      const profile = await ctx.tx.familyProfile.findFirst({ where: { id: profileId, familyId } });
      if (!profile) throw new NotFoundError("Profile not found");
      // Everyone may rename their own profile; others need ADMIN.
      if (profile.userId !== ctx.userId) assertRole(ctx, "ADMIN");
      await ctx.tx.familyProfile.update({ where: { id: profileId }, data: { displayName: name } });
    },
    client,
  );
}

export function deleteChildProfile(userId: string, familyId: string, profileId: string, client?: PrismaClient) {
  return withFamily(
    userId,
    familyId,
    async (ctx) => {
      assertRole(ctx, "ADMIN");
      const res = await ctx.tx.familyProfile.deleteMany({ where: { id: profileId, familyId, isChild: true, userId: null } });
      if (res.count !== 1) throw new NotFoundError("Child profile not found");
    },
    client,
  );
}

