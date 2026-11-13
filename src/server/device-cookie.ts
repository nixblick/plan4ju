import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { authSecret } from "./env";

// "Known device" marker for the login brake: after a successful login the browser gets a signed
// cookie with a random device id, bound to the account's e-mail. It is not a credential and grants
// nothing; it only selects which failure counter brakes an attempt (see ratelimit.ts). One cookie
// per account, so several accounts on one device each stay known.
export const DEVICE_COOKIE_MAX_AGE = 400 * 24 * 60 * 60; // seconds

export const deviceCookieName = (email: string) => `p4j_dev_${createHash("sha256").update(email).digest("hex").slice(0, 16)}`;

function mac(email: string, deviceId: string): string {
  return createHmac("sha256", authSecret()).update(`device:${email}:${deviceId}`).digest("base64url");
}

/** A fresh cookie value `<deviceId>.<mac>` for this account. */
export function newDeviceCookie(email: string, deviceId: string = randomBytes(16).toString("base64url")): string {
  return `${deviceId}.${mac(email, deviceId)}`;
}

/** The device id when the cookie is genuine for this account, else null (missing, forged, other account). */
export function readDeviceCookie(email: string, value: string | undefined): string | null {
  if (!value) return null;
  const i = value.lastIndexOf(".");
  if (i <= 0 || i > 64) return null;
  const deviceId = value.slice(0, i);
  const given = Buffer.from(value.slice(i + 1));
  const expected = Buffer.from(mac(email, deviceId));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  return deviceId;
}
