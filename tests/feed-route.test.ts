import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { admin, app, cleanup, seed, type Fixture } from "./helpers";
import { resetRateLimits } from "../src/server/ratelimit";
import { createFeed } from "../src/server/services/notifications";
import { GET } from "../src/app/api/kalender/feed/[token]/route";

// Calendar services fetch many feeds from a few shared addresses: the limit belongs to the link, not the address.
let f: Fixture;
beforeAll(async () => { f = await seed(); });
afterEach(() => resetRateLimits());
afterAll(async () => { await cleanup(f); await app.$disconnect(); await admin.$disconnect(); });

const SHARED = "203.0.113.7";
const get = (token: string) =>
  GET(new Request(`http://x/api/kalender/feed/${token}.ics`, { headers: { "x-forwarded-for": SHARED } }), { params: Promise.resolve({ token: `${token}.ics` }) });

describe("feed rate limit", () => {
  it("counts per link: one busy link is limited, another link from the same address still works", async () => {
    const t1 = await createFeed(f.userA, f.familyA, app);
    const t2 = await createFeed(f.userB, f.familyB, app);
    for (let i = 0; i < 60; i++) expect((await get(t1)).status).toBe(200);
    expect((await get(t1)).status).toBe(429);
    expect((await get(t2)).status).toBe(200);
  });

  it("unknown links count per address and then lock that address out", async () => {
    const t = await createFeed(f.userA, f.familyA, app);
    for (let i = 0; i < 30; i++) expect((await get(`x${"a".repeat(42)}${i}`)).status).toBe(404);
    expect((await get(t)).status).toBe(429);
  });
});
