import { describe, expect, it } from "vitest";
import { localParts, zonedToUtc } from "../src/lib/tz";

const TZ = "Europe/Berlin";

describe("zonedToUtc / localParts", () => {
  it("winter and summer offsets", () => {
    expect(zonedToUtc("2026-01-15", "18:00", TZ).toISOString()).toBe("2026-01-15T17:00:00.000Z");
    expect(zonedToUtc("2026-07-15", "18:00", TZ).toISOString()).toBe("2026-07-15T16:00:00.000Z");
  });
  it("the same wall time stays the same across the change (18:00 on both sides)", () => {
    expect(localParts(zonedToUtc("2026-03-28", "18:00", TZ), TZ).time).toBe("18:00");
    expect(localParts(zonedToUtc("2026-03-30", "18:00", TZ), TZ).time).toBe("18:00");
  });
  it("29.03.2026 02:30 does not exist: moves forward to 03:30", () => {
    const d = zonedToUtc("2026-03-29", "02:30", TZ);
    expect(d.toISOString()).toBe("2026-03-29T01:30:00.000Z");
    expect(localParts(d, TZ)).toEqual({ date: "2026-03-29", time: "03:30" });
  });
  it("25.10.2026 02:30 happens twice: takes the first (summer time)", () => {
    expect(zonedToUtc("2026-10-25", "02:30", TZ).toISOString()).toBe("2026-10-25T00:30:00.000Z");
  });
  it("late evening in UTC is the next local day", () => {
    expect(localParts(new Date("2026-11-16T23:30:00Z"), TZ)).toEqual({ date: "2026-11-17", time: "00:30" });
  });
  it("works for zones west of UTC", () => {
    expect(zonedToUtc("2026-11-16", "09:00", "America/New_York").toISOString()).toBe("2026-11-16T14:00:00.000Z");
  });
});
