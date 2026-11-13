import { createHmac, timingSafeEqual } from "node:crypto";
import { authSecret } from "./env";

export const FAMILY_COOKIE = "p4j_family";

function mac(userId: string, familyId: string): string {
  return createHmac("sha256", authSecret()).update(`family:${userId}:${familyId}`).digest("base64url");
}

/** Cookie value that binds the chosen family to one user. Tampering or another user's cookie fails. */
export function signFamilyChoice(userId: string, familyId: string): string {
  return `${familyId}.${mac(userId, familyId)}`;
}

export function readFamilyChoice(userId: string, value: string | undefined): string | null {
  if (!value) return null;
  const i = value.lastIndexOf(".");
  if (i <= 0) return null;
  const familyId = value.slice(0, i);
  const given = Buffer.from(value.slice(i + 1));
  const expected = Buffer.from(mac(userId, familyId));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  return familyId;
}
