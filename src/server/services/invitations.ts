import { z } from "zod";
import type { FamilyRole, PrismaClient } from "@prisma/client";
import { prisma } from "../db";
import { ConflictError, ForbiddenError, InvalidInvitationError, NotFoundError } from "../errors";
import { assertRole, canGrant } from "../permissions";
import { generateToken, hashToken } from "../tokens";
import { withFamily, withUser } from "../tenant";

export const INVITATION_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export const invitationInput = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  role: z.enum(["ADMIN", "MEMBER"]).default("MEMBER"),
});

export interface CreatedInvitation {
  id: string;
  token: string; // shown once; only the hash is stored
  email: string;
  role: FamilyRole;
  expiresAt: Date;
}

/** OWNER and ADMIN may invite; ADMIN only as MEMBER. The raw token is returned once. */
export async function createInvitation(
  userId: string,
  familyId: string,
  input: z.input<typeof invitationInput>,
  client?: PrismaClient,
): Promise<CreatedInvitation> {
  const data = invitationInput.parse(input);
  return withFamily(
    userId,
    familyId,
    async (ctx) => {
      assertRole(ctx, "ADMIN");
      if (!canGrant(ctx.role, data.role)) throw new ForbiddenError("Role may not be granted");
      const already = await ctx.tx.familyMembership.count({
        where: { familyId, user: { email: data.email } },
      });
      if (already > 0) throw new ConflictError("Already a member");
      const token = generateToken();
      const inv = await ctx.tx.familyInvitation.create({
        data: {
          familyId,
          email: data.email,
          role: data.role,
          tokenHash: hashToken(token),
          expiresAt: new Date(Date.now() + INVITATION_DAYS * DAY_MS),
        },
      });
      return { id: inv.id, token, email: inv.email, role: inv.role, expiresAt: inv.expiresAt };
    },
    client,
  );
}

/** Pending (not accepted, not revoked) invitations, including expired ones for visibility. */
export function listInvitations(userId: string, familyId: string, client?: PrismaClient) {
  return withFamily(
    userId,
    familyId,
    async (ctx) => {
      assertRole(ctx, "ADMIN");
      const rows = await ctx.tx.familyInvitation.findMany({
        where: { familyId, acceptedAt: null, revokedAt: null },
        orderBy: { createdAt: "desc" },
        select: { id: true, email: true, role: true, expiresAt: true, createdAt: true },
      });
      const now = Date.now();
      return rows.map((r) => ({ ...r, expired: r.expiresAt.getTime() <= now }));
    },
    client,
  );
}

export function revokeInvitation(userId: string, familyId: string, id: string, client?: PrismaClient) {
  return withFamily(
    userId,
    familyId,
    async (ctx) => {
      assertRole(ctx, "ADMIN");
      const res = await ctx.tx.familyInvitation.updateMany({
        where: { id, familyId, acceptedAt: null, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (res.count !== 1) throw new NotFoundError("Invitation not found");
    },
    client,
  );
}

export type InvitationStatus = "valid" | "expired" | "revoked" | "accepted" | "unknown";

export interface InvitationInfo {
  status: InvitationStatus;
  familyName?: string;
  email?: string;
  role?: FamilyRole;
  accountExists?: boolean;
}

interface LookupRow {
  family_name: string;
  email: string;
  role: FamilyRole;
  expires_at: Date;
  accepted_at: Date | null;
  revoked_at: Date | null;
  account_exists: boolean;
}

/** Contextless lookup by token (the invitee has no family yet). Details only for a valid token. */
export async function lookupInvitation(token: string, client: PrismaClient = prisma): Promise<InvitationInfo> {
  if (!token || token.length > 200) return { status: "unknown" };
  const rows = await client.$queryRaw<LookupRow[]>`SELECT * FROM app_invitation_lookup(${hashToken(token)})`;
  const r = rows[0];
  if (!r) return { status: "unknown" };
  // Postgres timestamp (UTC, no zone) is read by Prisma as UTC.
  if (r.accepted_at) return { status: "accepted" };
  if (r.revoked_at) return { status: "revoked" };
  if (r.expires_at.getTime() <= Date.now()) return { status: "expired" };
  return {
    status: "valid",
    familyName: r.family_name,
    email: r.email,
    role: r.role,
    accountExists: r.account_exists,
  };
}

/**
 * The signed-in user joins the family. The database function checks that the token is
 * valid and unused, that the e-mail matches, and consumes it atomically.
 */
export async function acceptInvitation(userId: string, token: string, client?: PrismaClient): Promise<string> {
  try {
    const rows = await withUser(
      userId,
      (tx) => tx.$queryRaw<{ app_invitation_accept: string }[]>`SELECT app_invitation_accept(${hashToken(token)}, ${userId})`,
      client,
    );
    return rows[0]!.app_invitation_accept;
  } catch (e) {
    if (e instanceof Error && /invitation: /.test(e.message)) throw new InvalidInvitationError();
    throw e;
  }
}
