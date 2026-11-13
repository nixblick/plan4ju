import { describe, expect, it } from "vitest";
import { analyticsConfig } from "../src/server/analytics";
import { buildCsp } from "../src/proxy";

describe("analytics snippet", () => {
  it("is off without ANALYTICS_SCRIPT_URL", () => {
    expect(analyticsConfig({})).toBeNull();
    expect(analyticsConfig({ ANALYTICS_SCRIPT_URL: "  " })).toBeNull();
  });
  it("rejects non-http URLs and garbage", () => {
    expect(analyticsConfig({ ANALYTICS_SCRIPT_URL: "javascript:alert(1)" })).toBeNull();
    expect(analyticsConfig({ ANALYTICS_SCRIPT_URL: "not a url" })).toBeNull();
  });
  it("reads URL and site from env", () => {
    const c = analyticsConfig({ ANALYTICS_SCRIPT_URL: "https://stats.example.test/tracker.js", ANALYTICS_SITE: "plan.example.test" });
    expect(c).toEqual({ src: "https://stats.example.test/tracker.js", site: "plan.example.test", origin: "https://stats.example.test" });
  });
  it("CSP allows the analytics origin only when configured", () => {
    expect(buildCsp(false)).not.toContain("stats.example.test");
    expect(buildCsp(false, "https://stats.example.test")).toContain("script-src 'self' 'unsafe-inline' https://stats.example.test");
    expect(buildCsp(false)).toContain("frame-ancestors 'none'");
  });
});
