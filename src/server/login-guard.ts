import { RateLimitError } from "./errors";
import { admitKnownDevice, assertLoginAllowed, brakeKey, loginDelayMs, recordLoginFailure, recordLoginSuccess } from "./ratelimit";

// Above the account threshold only one attempt per delay window. The window is reserved
// before sleeping, so parallel requests cannot all sleep and then all try a credential.
const accountSlots = new Map<string, number>();

/**
 * Reserves the next login attempt for an account and returns the delay to wait before the
 * credential check (0 below the threshold). Throws RateLimitError, without any check,
 * while another attempt holds the current window.
 */
export function reserveLoginAttempt(email: string, now = Date.now(), deviceId?: string | null): number {
  const delay = loginDelayMs(email, now, deviceId);
  if (delay === 0) return 0;
  const key = brakeKey(email, deviceId);
  const busyUntil = accountSlots.get(key) ?? 0;
  if (now < busyUntil) throw new RateLimitError();
  if (accountSlots.size > 10_000) {
    for (const [k, t] of accountSlots) {
      if (t <= now) accountSlots.delete(k);
    }
  }
  accountSlots.set(key, now + delay);
  return delay;
}

/** Clears the counters and the reserved window after a successful login. */
export function loginSucceeded(email: string, ip: string, deviceId?: string | null): void {
  recordLoginSuccess(email, ip, deviceId);
  accountSlots.delete(brakeKey(email, deviceId));
}

/**
 * The guarded login: hard limit per e-mail and address, one reserved attempt per window
 * above the account threshold, sleep, then verify. Failures (isFailure) are counted, a
 * success clears both counters and the window. `deviceId` is the verified id of a known device
 * (device-cookie.ts); it is exempt from the account delay (at most MAX_KNOWN_DEVICES per account)
 * and braked on its own counter, but its failures still count on the account.
 */
export async function guardedLogin<T>(
  email: string,
  ip: string,
  verify: () => Promise<T>,
  isFailure: (e: unknown) => boolean,
  deviceId: string | null = null,
  stamp: string | null = null,
): Promise<T> {
  assertLoginAllowed(email, ip);
  deviceId = admitKnownDevice(email, deviceId, stamp);
  const delay = reserveLoginAttempt(email, Date.now(), deviceId);
  if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
  let out: T;
  try {
    out = await verify();
  } catch (e) {
    if (isFailure(e)) recordLoginFailure(email, ip, Date.now(), deviceId);
    throw e;
  }
  loginSucceeded(email, ip, deviceId);
  return out;
}
