import { beforeAll, describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "../src/server/calendar-crypto";

beforeAll(() => {
  process.env.BETTER_AUTH_SECRET ??= "x".repeat(40);
});

describe("calendar secret encryption", () => {
  const url = "https://calendar.example.test/feed/token-abc123.ics";
  it("round trips and does not contain the plain text", () => {
    const blob = encryptSecret(url, "fam:cal");
    expect(blob).not.toContain("example.test");
    expect(blob).not.toContain("https");
    expect(decryptSecret(blob, "fam:cal")).toBe(url);
  });
  it("is randomized", () => {
    expect(encryptSecret(url, "a")).not.toBe(encryptSecret(url, "a"));
  });
  it("refuses another row (AAD) and tampering", () => {
    const blob = encryptSecret(url, "fam:cal");
    expect(() => decryptSecret(blob, "fam:other")).toThrow();
    const parts = blob.split(".");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(() => decryptSecret(parts.join("."), "fam:cal")).toThrow();
  });
  it("cannot be read after the secret changed", () => {
    const blob = encryptSecret(url, "a");
    const old = process.env.BETTER_AUTH_SECRET;
    process.env.BETTER_AUTH_SECRET = "y".repeat(40);
    try {
      expect(() => decryptSecret(blob, "a")).toThrow();
    } finally {
      process.env.BETTER_AUTH_SECRET = old;
    }
  });
});
