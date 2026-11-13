import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { authSecret } from "./env";

// Subscription URLs of external calendars may carry a private token, so they are secrets: stored only
// encrypted (AES-256-GCM), never sent back to the browser, never logged. The key is derived from
// BETTER_AUTH_SECRET (HKDF-SHA256, own info label), so no extra variable is needed. Consequence: if
// that secret is rotated, stored subscription URLs cannot be decrypted and must be entered again.

const INFO = "plan4ju calendar-url v1";

function key(): Buffer {
  return Buffer.from(hkdfSync("sha256", authSecret(), "plan4ju", INFO, 32));
}

/** `aad` binds the ciphertext to its row (e.g. `${familyId}:${calendarId}`), so it cannot be moved. */
export function encryptSecret(plain: string, aad: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  c.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), ct.toString("base64url")].join(".");
}

export function decryptSecret(blob: string, aad: string): string {
  const [v, iv, tag, ct] = blob.split(".");
  if (v !== "v1" || !iv || !tag || !ct) throw new Error("Unreadable secret");
  const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  d.setAAD(Buffer.from(aad));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(ct, "base64url")), d.final()]).toString("utf8");
}
