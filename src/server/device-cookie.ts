import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { prisma } from "./db";
import { authSecret } from "./env";
import { forgetKnownDevices } from "./ratelimit";

// "Known device" marker for the login brake: after a successful login the browser gets a signed
// cookie with a random device id, bound to the account's e-mail and its security stamp. It is not a
// credential and grants nothing; it only exempts the device from the account's login delay (see
// ratelimit.ts). One cookie per account, so several accounts on one device each stay known.
//
// Value: `<deviceId>.<iat>.<mac>`, iat in seconds. The MAC covers e-mail, security stamp, device id
// and iat. A cookie stops working after DEVICE_COOKIE_MAX_AGE (checked on the server, not only by
// the browser) and as soon as the user's security stamp changes (password change or reset,
// "sign out everywhere"). Re-issuing after a login keeps the original iat, so the lifetime is not
// extended endlessly; after it ends the device gets a fresh id.
export const DEVICE_COOKIE_MAX_AGE = 90 * 24 * 60 * 60; // seconds

export const deviceCookieName = (email: string) => `p4j_dev_${createHash("sha256").update(email).digest("hex").slice(0, 16)}`;

function mac(email: string, stamp: string, deviceId: string, iat: number): string {
  return createHmac("sha256", authSecret())
    .update(`device:v2:${JSON.stringify([email, stamp, deviceId, iat])}`)
    .digest("base64url");
}

const nowSec = (now: number) => Math.floor(now / 1000);

export interface DeviceCookie {
  deviceId: string;
  /** Issued at, seconds since the epoch. */
  iat: number;
}

/** A cookie value for this account. Pass the iat of a still valid cookie to keep its lifetime. */
export function newDeviceCookie(
  email: string,
  stamp: string,
  device: Partial<DeviceCookie> = {},
  now = Date.now(),
): string {
  const deviceId = device.deviceId ?? randomBytes(16).toString("base64url");
  const iat = device.iat ?? nowSec(now);
  return `${deviceId}.${iat}.${mac(email, stamp, deviceId, iat)}`;
}

/** Seconds the cookie may still live in the browser (never past its server-side maximum age). */
export function remainingMaxAge(iat: number, now = Date.now()): number {
  return Math.max(0, iat + DEVICE_COOKIE_MAX_AGE - nowSec(now));
}

/**
 * The device when the cookie is genuine for this account and stamp and not older than
 * DEVICE_COOKIE_MAX_AGE, else null (missing, forged, other account, old stamp, expired).
 */
export function readDeviceCookie(email: string, stamp: string | null, value: string | undefined, now = Date.now()): DeviceCookie | null {
  if (!value || !stamp || value.length > 200) return null;
  const parts = value.split(".");
  if (parts.length !== 3) return null;
  const [deviceId, iatRaw, givenMac] = parts as [string, string, string];
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(deviceId) || !/^\d{1,12}$/.test(iatRaw)) return null;
  const iat = Number(iatRaw);
  const given = Buffer.from(givenMac);
  const expected = Buffer.from(mac(email, stamp, deviceId, iat));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  const age = nowSec(now) - iat;
  if (age < -60 || age >= DEVICE_COOKIE_MAX_AGE) return null;
  return { deviceId, iat };
}

/** The current security stamp of the account with this e-mail, null when there is none. */
export async function securityStampFor(email: string): Promise<string | null> {
  const u = await prisma.user.findUnique({ where: { email }, select: { securityStamp: true } });
  return u?.securityStamp ?? null;
}

/** New stamp: every device cookie of this user stops working, and its known devices are forgotten. */
export async function rotateSecurityStamp(userId: string): Promise<void> {
  const u = await prisma.user.update({
    where: { id: userId },
    data: { securityStamp: randomBytes(16).toString("base64url") },
    select: { email: true },
  });
  forgetKnownDevices(u.email);
}
