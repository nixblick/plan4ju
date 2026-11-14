import type { PrismaClient } from "@prisma/client";
import { changeStamp, familyChangedAt } from "./family-changes";
import { countUnread, syncAndCount } from "./services/notifications";

/**
 * The bell runs on every page (root layout). Generating notifications costs about a dozen queries and some
 * writes, so it runs at most every BELL_SYNC_MS per user and family, and at once after a change in the family
 * (family-changes.ts) and on the notifications page. In between the bell only counts.
 */
export const BELL_SYNC_MS = 5 * 60 * 1000;
const lastSync = new Map<string, { stamp: number; at: number }>();

export async function bellCount(userId: string, familyId: string, now: Date = new Date(), client?: PrismaClient): Promise<number> {
  const key = JSON.stringify([userId, familyId]);
  const last = lastSync.get(key);
  const at = now.getTime();
  if (last && last.stamp > familyChangedAt(familyId) && at >= last.at && at - last.at < BELL_SYNC_MS) {
    return countUnread(userId, familyId, client);
  }
  // Taken before generating: a change during the run makes the next page load sync again.
  const stamp = changeStamp();
  const n = await syncAndCount(userId, familyId, now, client);
  if (lastSync.size > 10_000) lastSync.clear();
  lastSync.set(key, { stamp, at });
  return n;
}

/** Tests only. */
export function resetBellSync(): void {
  lastSync.clear();
}
