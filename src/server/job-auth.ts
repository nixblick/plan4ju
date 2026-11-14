import { createHash, timingSafeEqual } from "node:crypto";

/** Minimum length of a job token (NOTIFY_JOB_TOKEN, JOB_TOKEN); shorter (or unset) disables the job endpoint. */
export const MIN_JOB_TOKEN = 32;

/** True when the Authorization header carries exactly the job token from the environment. */
export function jobAuthorized(header: string | null, expected = process.env.NOTIFY_JOB_TOKEN): boolean {
  if (!expected || expected.length < MIN_JOB_TOKEN || !header?.startsWith("Bearer ")) return false;
  const a = createHash("sha256").update(header.slice(7)).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}
