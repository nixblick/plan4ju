// Remembers, per family and in memory, when something changed that can create a notification (tasks,
// assignments, declines, birthdays, routines, preferences). The bell uses it to skip the notification
// generation on page loads when nothing changed (notification-sync.ts). One instance only, like ratelimit.ts:
// with several instances a change on another one is noticed after the bell's interval at the latest.
const changedAt = new Map<string, number>();
let tick = 0;

/** Monotonic stamp, so two changes within one millisecond are still ordered. */
export function changeStamp(): number {
  tick = Math.max(tick + 1, Date.now());
  return tick;
}

export function markFamilyChanged(familyId: string): void {
  if (changedAt.size > 10_000) changedAt.clear();
  changedAt.set(familyId, changeStamp());
}

export function familyChangedAt(familyId: string): number {
  return changedAt.get(familyId) ?? 0;
}
