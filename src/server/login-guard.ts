import { RateLimitError } from "./errors";
import { accountFailureKey, assertLoginAllowed, loginDelayMs, recordLoginFailure, recordLoginSuccess } from "./ratelimit";

// Above the account threshold only one attempt per delay window. The window is reserved
// before sleeping, so parallel requests cannot all sleep and then all try a credential.
const accountSlots = new Map<string, number>();

/**
 * Reserves the next login attempt for an account and returns the delay to wait before the
 * credential check (0 below the threshold). Throws RateLimitError, without any check,
 * while another attempt holds the current window.
 */
export function reserveLoginAttempt(email: string, now = Date.now()): number {
  const delay = loginDelayMs(email, now);
  if (delay === 0) return 0;
  const key = accountFailureKey(email);
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
export function loginSucceeded(email: string, ip: string): void {
  recordLoginSuccess(email, ip);
  accountSlots.delete(accountFailureKey(email));
}

/**
 * The guarded login: hard limit per e-mail and address, one reserved attempt per window
 * above the account threshold, sleep, then verify. Failures (isFailure) are counted, a
 * success clears both counters and the window.
 */
export async function guardedLogin<T>(
  email: string,
  ip: string,
  verify: () => Promise<T>,
  isFailure: (e: unknown) => boolean,
): Promise<T> {
  assertLoginAllowed(email, ip);
  const delay = reserveLoginAttempt(email);
  if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
  let out: T;
  try {
    out = await verify();
  } catch (e) {
    if (isFailure(e)) recordLoginFailure(email, ip);
    throw e;
  }
  loginSucceeded(email, ip);
  return out;
}
