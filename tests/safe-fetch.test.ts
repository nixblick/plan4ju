import { describe, expect, it } from "vitest";
import {
  fetchCalendarText,
  FetchError,
  isBlockedAddress,
  parseCalendarUrl,
  type Resolver,
  type Transport,
} from "../src/server/safe-fetch";

const PUBLIC = [{ address: "93.184.216.34", family: 4 as const }];
const resolvePublic: Resolver = async () => PUBLIC;
const ok = (body: string): Transport => async () => ({ status: 200, body: Buffer.from(body) });
const ICS = "BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n";

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    if (e instanceof FetchError) return e.stored;
    throw e;
  }
  return "no error";
}

describe("isBlockedAddress", () => {
  it.each([
    "0.0.0.0", "10.1.2.3", "100.64.0.1", "127.0.0.1", "127.255.255.254", "169.254.169.254", "172.16.0.1", "172.31.255.255",
    "192.168.1.1", "192.0.2.5", "198.18.0.1", "198.51.100.1", "203.0.113.9", "224.0.0.1", "255.255.255.255",
    "::", "::1", "fe80::1", "fc00::1", "fd00:ec2::254", "ff02::1", "2001:db8::1",
    "::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:169.254.169.254", "::ffff:10.0.0.1", "64:ff9b::7f00:1", "2002:7f00:1::1", "::127.0.0.1", "2001:0:4136:e378:8000:63bf:3fff:fdd2", "64:ff9b:1::a00:1",
    "nonsense", "",
  ])("blocks %s", (ip) => {
    expect(isBlockedAddress(ip)).toBe(true);
  });
  it.each(["93.184.216.34", "8.8.8.8", "172.32.0.1", "100.63.255.255", "2606:4700:4700::1111", "::ffff:8.8.8.8", "2a00:1450:4001::200e"])(
    "allows public %s",
    (ip) => {
      expect(isBlockedAddress(ip)).toBe(false);
    },
  );
});

describe("parseCalendarUrl", () => {
  it("accepts https and webcal, rewrites webcal", () => {
    expect(parseCalendarUrl("https://cal.example.test/a.ics").href).toBe("https://cal.example.test/a.ics");
    expect(parseCalendarUrl("webcal://cal.example.test/a.ics").protocol).toBe("https:");
  });
  it.each([
    "http://cal.example.test/a.ics",
    "ftp://cal.example.test/a.ics",
    "file:///etc/passwd",
    "javascript:alert(1)",
    "https://user:pw@cal.example.test/a.ics",
    "https://cal.example.test:8443/a.ics",
    "not a url",
    "",
  ])("refuses %s as protokoll", (u) => {
    expect(() => parseCalendarUrl(u)).toThrow(expect.objectContaining({ code: "protokoll" }));
  });
  it.each([
    "https://127.0.0.1/a.ics",
    "https://2130706433/a.ics", // decimal form of 127.0.0.1
    "https://0x7f.1/a.ics",
    "https://[::1]/a.ics",
    "https://[::ffff:127.0.0.1]/a.ics",
    "https://169.254.169.254/latest/meta-data",
    "https://localhost/a.ics",
    "https://printer.local/a.ics",
    "https://10.0.0.5/a.ics",
  ])("refuses %s as blockiert", (u) => {
    expect(() => parseCalendarUrl(u)).toThrow(expect.objectContaining({ code: "blockiert" }));
  });
});

describe("fetchCalendarText", () => {
  it("returns the body for a public host", async () => {
    expect(await fetchCalendarText("https://cal.example.test/a.ics", { resolve: resolvePublic, transport: ok(ICS) })).toBe(ICS);
  });
  it("connects to the validated address", async () => {
    let seen = "";
    await fetchCalendarText("https://cal.example.test/a.ics", {
      resolve: resolvePublic,
      transport: async (r) => {
        seen = r.to.address;
        return { status: 200, body: Buffer.from(ICS) };
      },
    });
    expect(seen).toBe("93.184.216.34");
  });
  it("refuses a public looking name that resolves to loopback", async () => {
    const r: Resolver = async () => [{ address: "127.0.0.1", family: 4 }];
    expect(await code(fetchCalendarText("https://cal.example.test/a.ics", { resolve: r, transport: ok(ICS) }))).toBe("blockiert");
  });
  it("refuses when only one of several addresses is private", async () => {
    const r: Resolver = async () => [...PUBLIC, { address: "10.0.0.1", family: 4 }];
    expect(await code(fetchCalendarText("https://cal.example.test/a.ics", { resolve: r, transport: ok(ICS) }))).toBe("blockiert");
  });
  it("refuses IPv6 mapped loopback from DNS", async () => {
    const r: Resolver = async () => [{ address: "::ffff:127.0.0.1", family: 6 }];
    expect(await code(fetchCalendarText("https://cal.example.test/a.ics", { resolve: r, transport: ok(ICS) }))).toBe("blockiert");
  });
  it("does not call the transport for a blocked address", async () => {
    let called = false;
    await code(
      fetchCalendarText("https://192.168.0.10/a.ics", { transport: async () => ((called = true), { status: 200, body: Buffer.from(ICS) }) }),
    );
    expect(called).toBe(false);
  });
  it("maps a DNS failure", async () => {
    const r: Resolver = async () => {
      throw new Error("ENOTFOUND secret-host.example.test");
    };
    expect(await code(fetchCalendarText("https://cal.example.test/a.ics", { resolve: r, transport: ok(ICS) }))).toBe("aufloesung");
  });

  describe("redirects", () => {
    const redirectTo = (loc: string): Transport => async () => ({ status: 302, location: loc, body: Buffer.alloc(0) });
    it("follows a redirect to another public https address and checks it again", async () => {
      const hosts: string[] = [];
      const t: Transport = async (r) => {
        hosts.push(r.url.hostname);
        return r.url.hostname === "a.example.test" ? { status: 301, location: "https://b.example.test/x.ics", body: Buffer.alloc(0) } : { status: 200, body: Buffer.from(ICS) };
      };
      expect(await fetchCalendarText("https://a.example.test/x.ics", { resolve: resolvePublic, transport: t })).toBe(ICS);
      expect(hosts).toEqual(["a.example.test", "b.example.test"]);
    });
    it("refuses a redirect to http", async () => {
      expect(await code(fetchCalendarText("https://a.example.test/x.ics", { resolve: resolvePublic, transport: redirectTo("http://b.example.test/x.ics") }))).toBe("umleitung");
    });
    it("refuses a redirect to the metadata address", async () => {
      expect(await code(fetchCalendarText("https://a.example.test/x.ics", { resolve: resolvePublic, transport: redirectTo("https://169.254.169.254/latest/meta-data") }))).toBe("blockiert");
    });
    it("refuses a redirect to a name that resolves privately", async () => {
      const r: Resolver = async (h) => (h === "evil.example.test" ? [{ address: "10.0.0.7", family: 4 }] : PUBLIC);
      expect(await code(fetchCalendarText("https://a.example.test/x.ics", { resolve: r, transport: redirectTo("https://evil.example.test/") }))).toBe("blockiert");
    });
    it("refuses a redirect without target and endless redirects", async () => {
      expect(await code(fetchCalendarText("https://a.example.test/x.ics", { resolve: resolvePublic, transport: async () => ({ status: 302, body: Buffer.alloc(0) }) }))).toBe("umleitung");
      expect(await code(fetchCalendarText("https://a.example.test/x.ics", { resolve: resolvePublic, transport: redirectTo("https://a.example.test/x.ics") }))).toBe("umleitung");
    });
  });

  it("maps HTTP status without the address", async () => {
    expect(await code(fetchCalendarText("https://cal.example.test/a.ics", { resolve: resolvePublic, transport: async () => ({ status: 404, body: Buffer.alloc(0) }) }))).toBe("status-404");
  });
  it("refuses a body over the limit", async () => {
    expect(await code(fetchCalendarText("https://cal.example.test/a.ics", { resolve: resolvePublic, transport: ok("x".repeat(100)), maxBytes: 50 }))).toBe("gross");
  });
  it("times out", async () => {
    const slow: Transport = ({ signal }) => new Promise((_, rej) => signal.addEventListener("abort", () => rej(new Error("aborted"))));
    expect(await code(fetchCalendarText("https://cal.example.test/a.ics", { resolve: resolvePublic, transport: slow, timeoutMs: 50 }))).toBe("zeit");
  });
  it("errors never contain the address", async () => {
    const secretUrl = "https://cal.example.test/feed/SECRETTOKEN.ics";
    const boom: Transport = async () => {
      throw new Error(`connect ECONNREFUSED ${secretUrl}`);
    };
    try {
      await fetchCalendarText(secretUrl, { resolve: resolvePublic, transport: boom });
      expect.unreachable();
    } catch (e) {
      expect(String((e as Error).message) + String((e as Error).stack)).not.toContain("SECRETTOKEN");
      expect((e as FetchError).code).toBe("netz");
    }
  });
});
