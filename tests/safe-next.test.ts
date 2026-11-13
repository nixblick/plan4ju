import { describe, expect, it } from "vitest";
import { safeNext } from "../src/lib/safe-next";
import { clientIp, trustedProxyHops, withClientIp, CLIENT_IP_HEADER } from "../src/server/client-ip";
import {
  accountFailureKey, assertBelowLimit, assertLoginAllowed, clearLimit, loginDelayMs, loginFailureKey, normalizeLoginEmail,
  recordHit, recordLoginFailure, recordLoginSuccess,
} from "../src/server/ratelimit";
import { RateLimitError } from "../src/server/errors";
import { guardedLogin, loginSucceeded, reserveLoginAttempt } from "../src/server/login-guard";
import { newDeviceCookie, readDeviceCookie, deviceCookieName } from "../src/server/device-cookie";

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

  it("uses x-real-ip only when configured as proxy-set, otherwise no trusted address", () => {
    expect(clientIp(h({ "x-real-ip": "203.0.113.5" }), 1, true)).toBe("203.0.113.5");
    expect(clientIp(h({ "x-real-ip": "203.0.113.5" }), 1, false)).toBeNull();
    expect(clientIp(h({ "x-forwarded-for": "203.0.113.9" }), 2, false)).toBeNull();
    expect(clientIp(h({ "x-forwarded-for": "203.0.113.9", "x-real-ip": "203.0.113.5" }), 0, true)).toBeNull();
    expect(withClientIp(h({ "x-real-ip": "203.0.113.5" }), 1, false).get(CLIENT_IP_HEADER)).toBeNull();
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

describe("login failures per account", () => {
  it("rotating addresses are slowed down (1, 2, 4 ... max 10 s), never hard blocked", () => {
    const email = `rotate-${Math.random().toString(36).slice(2)}@example.test`;
    const t0 = Date.now();
    for (let i = 0; i < 19; i++) recordLoginFailure(email, `198.51.100.${i + 1}`, t0);
    expect(loginDelayMs(email, t0)).toBe(0);
    const delays: number[] = [];
    for (let i = 19; i < 26; i++) {
      recordLoginFailure(email, `198.51.100.${i + 1}`, t0);
      delays.push(loginDelayMs(email, t0));
    }
    expect(delays).toEqual([1000, 2000, 4000, 8000, 10000, 10000, 10000]);
    expect(() => assertLoginAllowed(email, "198.51.100.200", t0)).not.toThrow();
    expect(loginDelayMs("other@example.test", t0)).toBe(0);
    recordLoginSuccess(email, "198.51.100.200");
    expect(loginDelayMs(email, t0)).toBe(0);
  });

  it("five failures from one address block that address; a success resets both counters", () => {
    const email = `one-${Math.random().toString(36).slice(2)}@example.test`;
    const t0 = Date.now();
    for (let i = 0; i < 4; i++) recordLoginFailure(email, "203.0.113.7", t0);
    recordLoginSuccess(email, "203.0.113.7");
    for (let i = 0; i < 4; i++) recordLoginFailure(email, "203.0.113.7", t0);
    expect(() => assertLoginAllowed(email, "203.0.113.7", t0)).not.toThrow();
    recordLoginFailure(email, "203.0.113.7", t0);
    expect(() => assertLoginAllowed(email, "203.0.113.7", t0)).toThrow(RateLimitError);
    expect(() => assertLoginAllowed(email, "203.0.113.8", t0)).not.toThrow();
  });

  it("keys live in separate namespaces and cannot collide", () => {
    expect(accountFailureKey("a@example.test")).not.toBe(loginFailureKey("a@example.test", ""));
    expect(loginFailureKey("a@x.test:1", "2")).not.toBe(loginFailureKey("a@x.test", "1:2"));
    expect(accountFailureKey("a@example.test").startsWith("login:acct:")).toBe(true);
    expect(loginFailureKey("a@example.test", "1").startsWith("login:pair:")).toBe(true);
  });

  it("normalizes and validates the e-mail", () => {
    expect(normalizeLoginEmail("  Anna@Example.TEST ")).toBe("anna@example.test");
    expect(normalizeLoginEmail("no-at-sign")).toBeNull();
    expect(normalizeLoginEmail("a b@example.test")).toBeNull();
  });
});

describe("one attempt per window above the account threshold", () => {
  const overThreshold = (email: string) => {
    for (let i = 0; i < 20; i++) recordLoginFailure(email, `198.51.100.${i + 1}`);
  };

  it("10 parallel attempts: at most one reaches the credential check", async () => {
    const email = `parallel-${Math.random().toString(36).slice(2)}@example.test`;
    overThreshold(email);
    let checks = 0;
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, (_, i) =>
        guardedLogin(
          email,
          `203.0.113.${i + 1}`,
          async () => {
            checks += 1;
            throw new Error("rejected");
          },
          () => true,
        ),
      ),
    );
    expect(checks).toBe(1);
    expect(results.filter((r) => r.status === "rejected" && r.reason instanceof RateLimitError)).toHaveLength(9);
  });

  it("an early attempt is refused, the owner gets through after the window", async () => {
    const email = `window-${Math.random().toString(36).slice(2)}@example.test`;
    overThreshold(email);
    const t0 = Date.now() + 60_000; // own clock, independent of the test above
    expect(reserveLoginAttempt(email, t0 - 60_000)).toBe(1000);
    expect(() => reserveLoginAttempt(email, t0 - 59_500)).toThrow(RateLimitError);
    expect(reserveLoginAttempt(email, t0 - 59_000)).toBe(1000);
    loginSucceeded(email, "203.0.113.1");
    expect(reserveLoginAttempt(email, t0 - 58_999)).toBe(0);
  });
});

describe("known devices are not braked by strangers (issue 5)", () => {
  const overThreshold = (email: string) => {
    for (let i = 0; i < 20; i++) recordLoginFailure(email, `198.51.100.${i + 1}`);
  };

  it("50 parallel attempts on the account do not brake the owner's known device", async () => {
    const email = `device-${Math.random().toString(36).slice(2)}@example.test`;
    const cookie = newDeviceCookie(email);
    const deviceId = readDeviceCookie(email, cookie);
    expect(deviceId).not.toBeNull();
    // attacker without a cookie: floods the account
    await Promise.allSettled(
      Array.from({ length: 50 }, (_, i) =>
        guardedLogin(email, `203.0.113.${(i % 200) + 1}`, async () => { throw new Error("no"); }, () => true),
      ),
    );
    expect(loginDelayMs(email)).toBeGreaterThan(0); // strangers are braked
    overThreshold(email);
    expect(reserveLoginAttempt(email, Date.now() + 120_000, deviceId)).toBe(0); // owner's device is not
    let ok = false;
    await guardedLogin(email, "192.0.2.50", async () => { ok = true; return 1; }, () => true, deviceId);
    expect(ok).toBe(true);
    // the owner's success does not reset the stranger's brake
    expect(loginDelayMs(email)).toBeGreaterThan(0);
  });

  it("a known device is braked on its own counter", () => {
    const email = `own-${Math.random().toString(36).slice(2)}@example.test`;
    const id = "device-a";
    for (let i = 0; i < 20; i++) recordLoginFailure(email, `198.51.100.${i + 1}`, Date.now(), id);
    expect(loginDelayMs(email, Date.now(), id)).toBe(1000);
    expect(loginDelayMs(email)).toBe(0);
    expect(loginDelayMs(email, Date.now(), "device-b")).toBe(0);
  });

  it("cookie is bound to the account and rejects forgeries", () => {
    const cookie = newDeviceCookie("a@example.test");
    expect(readDeviceCookie("a@example.test", cookie)).not.toBeNull();
    expect(readDeviceCookie("b@example.test", cookie)).toBeNull();
    expect(readDeviceCookie("a@example.test", `x${cookie}`)).toBeNull();
    expect(readDeviceCookie("a@example.test", undefined)).toBeNull();
    expect(readDeviceCookie("a@example.test", "abc")).toBeNull();
    expect(deviceCookieName("a@example.test")).not.toBe(deviceCookieName("b@example.test"));
  });
});
