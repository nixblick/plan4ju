import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { generateToken, hashToken } from "./tokens";
import { INVITATION_DAYS } from "./services/invitations";

const input = z.object({
  name: z.string().trim().min(1).max(100),
  ownerEmail: z.string().trim().toLowerCase().email().max(200),
});

/**
 * Instance administration: creates a family and an OWNER invitation for its first owner.
 * Must be called with the table owner connection (DATABASE_ADMIN_URL), never with the
 * request-handling app role. The raw token is returned once, nothing else stores it.
 */
export async function createFamilyWithOwnerInvitation(owner: PrismaClient, raw: z.input<typeof input>) {
  const data = input.parse(raw);
  const token = generateToken();
  const expiresAt = new Date(Date.now() + INVITATION_DAYS * 24 * 60 * 60 * 1000);
  const family = await owner.$transaction(async (tx) => {
    const f = await tx.family.create({ data: { name: data.name } });
    await tx.familyInvitation.create({
      data: { familyId: f.id, email: data.ownerEmail, role: "OWNER", tokenHash: hashToken(token), expiresAt },
    });
    return f;
  });
  return { familyId: family.id, token, expiresAt, email: data.ownerEmail };
}

/** Instance administration: a fresh OWNER invitation for an existing family (e.g. resend). */
export async function inviteOwnerToFamily(owner: PrismaClient, raw: { familyId: string; ownerEmail: string }) {
  const familyId = z.string().trim().min(1).max(64).parse(raw.familyId);
  const email = input.shape.ownerEmail.parse(raw.ownerEmail);
  const family = await owner.family.findUnique({ where: { id: familyId } });
  if (!family) throw new Error(`Family not found: ${familyId}`);
  const token = generateToken();
  const expiresAt = new Date(Date.now() + INVITATION_DAYS * 24 * 60 * 60 * 1000);
  await owner.familyInvitation.create({
    data: { familyId, email, role: "OWNER", tokenHash: hashToken(token), expiresAt },
  });
  return { familyId, familyName: family.name, token, expiresAt, email };
}
