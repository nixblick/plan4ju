import { describe, expect, it } from "vitest";
import { safeNext } from "../src/lib/safe-next";
import { clientIp, trustedProxyHops, withClientIp, CLIENT_IP_HEADER } from "../src/server/client-ip";
import { assertBelowLimit, clearLimit, recordHit } from "../src/server/ratelimit";
import { RateLimitError } from "../src/server/errors";

describe("safeNext (shared by the login page and the login action)", () => {
  it.each([
    "//x", "//evil.example", "/\\x", "/\\evil.example", "/%09/x", "/\t/x", "/\n/x", "/ /x", " /x",
    "/%2F%2Fevil.example", "javascript:alert(1)", "https://evil.example", "http:/x", "x", "", "/x\u0000",
  ])("rejects %j", (v) => {
    expect(safeNext(v)).toBeNull();
  });

  it.each([
    ["/", "/"],
    ["/aufgaben", "/aufgaben"],
    ["/familie/mitglieder?ok=rolle", "/familie/mitglieder?ok=rolle"],
    ["/geburtstage#heute", "/geburtstage#heute"],
    ["/aufgaben?q=a%20b", "/aufgaben?q=a%20b"],
    ["/a/../b", "/b"],
  ])("accepts %j", (v, out) => {
    expect(safeNext(v)).toBe(out);
  });

  it("ignores non-strings", () => {
    expect(safeNext(null)).toBeNull();
    expect(safeNext(undefined)).toBeNull();
  });
});

describe("client address from trusted proxy hops", () => {
  const h = (init: Record<string, string>) => new Headers(init);

  it("takes the entry the trusted proxy appended, not the spoofable left one", () => {
    const spoofed = h({ "x-forwarded-for": "6.6.6.6, 203.0.113.9" });
    expect(clientIp(spoofed, 1)).toBe("203.0.113.9");
    expect(clientIp(h({ "x-forwarded-for": "6.6.6.6, 203.0.113.9, 10.0.0.2" }), 2)).toBe("203.0.113.9");
  });

  it("falls back to x-real-ip, and ignores forwarded headers without a proxy", () => {
    expect(clientIp(h({ "x-real-ip": "203.0.113.5" }), 1)).toBe("203.0.113.5");
    expect(clientIp(h({ "x-forwarded-for": "203.0.113.9" }), 2)).toBeNull();
    expect(clientIp(h({ "x-forwarded-for": "203.0.113.9", "x-real-ip": "203.0.113.5" }), 0)).toBeNull();
  });

  it("reads TRUSTED_PROXY_HOPS with default 1", () => {
    expect(trustedProxyHops({})).toBe(1);
    expect(trustedProxyHops({ TRUSTED_PROXY_HOPS: "2" })).toBe(2);
    expect(trustedProxyHops({ TRUSTED_PROXY_HOPS: "0" })).toBe(0);
    expect(trustedProxyHops({ TRUSTED_PROXY_HOPS: "-1" })).toBe(1);
  });

  it("overwrites a client supplied internal header", () => {
    const out = withClientIp(h({ [CLIENT_IP_HEADER]: "1.2.3.4", "x-forwarded-for": "6.6.6.6, 203.0.113.9" }), 1);
    expect(out.get(CLIENT_IP_HEADER)).toBe("203.0.113.9");
    expect(withClientIp(h({ [CLIENT_IP_HEADER]: "1.2.3.4" }), 0).get(CLIENT_IP_HEADER)).toBeNull();
  });
});

describe("login failure limiter", () => {
  it("counts only recorded failures and is cleared after a success", () => {
    const k = "login:fail:test@example.test:203.0.113.1";
    const t0 = 5_000_000;
    for (let i = 0; i < 10; i++) assertBelowLimit(k, 5, t0); // checks alone never lock
    for (let i = 0; i < 5; i++) recordHit(k, 60_000, t0);
    expect(() => assertBelowLimit(k, 5, t0)).toThrow(RateLimitError);
    expect(() => assertBelowLimit("login:fail:test@example.test:198.51.100.2", 5, t0)).not.toThrow();
    expect(() => assertBelowLimit(k, 5, t0 + 60_001)).not.toThrow();
    clearLimit(k);
    expect(() => assertBelowLimit(k, 5, t0)).not.toThrow();
  });
});
