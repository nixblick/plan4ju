import { describe, expect, it } from "vitest";
import { expandEvent, externalItem, itemsOnDay, spanOf, type RawEvent } from "../src/lib/calendar-items";
import { buildDashboard } from "../src/server/services/dashboard";

const TZ = "Europe/Berlin";
const ev = (o: Partial<RawEvent>): RawEvent => ({
  id: "e1", title: "Termin", description: null, location: null, allDay: false,
  startsAt: new Date("2026-11-16T17:00:00Z"), endsAt: new Date("2026-11-16T18:00:00Z"), startDate: null, endDate: null,
  freq: null, interval: 1, weekdays: [], monthDay: null, repeatUntil: null, participantIds: [], ...o,
});

describe("spanOf", () => {
  it("timed event in local days and times", () => {
    expect(spanOf(ev({}), TZ)).toEqual({ startDate: "2026-11-16", endDate: "2026-11-16", startTime: "18:00", endTime: "19:00" });
  });
  it("an event late in the evening belongs to the local day, not the UTC day", () => {
    const s = spanOf(ev({ startsAt: new Date("2026-11-16T23:30:00Z"), endsAt: new Date("2026-11-17T00:30:00Z") }), TZ);
    expect([s.startDate, s.startTime, s.endDate, s.endTime]).toEqual(["2026-11-17", "00:30", "2026-11-17", "01:30"]);
  });
  it("an event ending exactly at midnight does not touch the next day", () => {
    const s = spanOf(ev({ startsAt: new Date("2026-11-16T21:00:00Z"), endsAt: new Date("2026-11-16T23:00:00Z") }), TZ);
    expect([s.startDate, s.endDate, s.endTime]).toEqual(["2026-11-16", "2026-11-16", null]);
  });
  it("an event across midnight touches both days", () => {
    const s = spanOf(ev({ startsAt: new Date("2026-11-16T21:30:00Z"), endsAt: new Date("2026-11-16T23:30:00Z") }), TZ);
    expect([s.startDate, s.endDate]).toEqual(["2026-11-16", "2026-11-17"]);
  });
  it("all-day keeps its days", () => {
    expect(spanOf(ev({ allDay: true, startsAt: null, endsAt: null, startDate: "2026-11-20", endDate: "2026-11-22" }), TZ)).toEqual({
      startDate: "2026-11-20", endDate: "2026-11-22", startTime: null, endTime: null,
    });
  });
});

describe("expandEvent", () => {
  it("single event only inside the range", () => {
    expect(expandEvent(ev({}), TZ, "2026-11-16", "2026-11-22")).toHaveLength(1);
    expect(expandEvent(ev({}), TZ, "2026-11-17", "2026-11-22")).toHaveLength(0);
  });
  it("weekly event keeps 18:00 local across the autumn change (25.10.2026)", () => {
    // first instance Sat 17.10.2026 18:00 local = 16:00Z
    const e = ev({ startsAt: new Date("2026-10-17T16:00:00Z"), endsAt: new Date("2026-10-17T17:00:00Z"), freq: "WEEKLY", weekdays: [5] });
    const items = expandEvent(e, TZ, "2026-10-17", "2026-11-07");
    expect(items.map((i) => `${i.startDate} ${i.startTime}`)).toEqual(["2026-10-17 18:00", "2026-10-24 18:00", "2026-10-31 18:00", "2026-11-07 18:00"]);
    expect(new Set(items.map((i) => i.key)).size).toBe(4);
  });
  it("repeatUntil ends the series; the range may start in the middle", () => {
    const e = ev({ freq: "DAILY", repeatUntil: "2026-11-19" });
    expect(expandEvent(e, TZ, "2026-11-18", "2026-12-31").map((i) => i.startDate)).toEqual(["2026-11-18", "2026-11-19"]);
  });
  it("a repeated multi-day event started before the range still shows", () => {
    const e = ev({ allDay: true, startsAt: null, endsAt: null, startDate: "2026-11-02", endDate: "2026-11-04", freq: "WEEKLY", weekdays: [0] });
    const items = expandEvent(e, TZ, "2026-11-10", "2026-11-10");
    expect(items.map((i) => [i.startDate, i.endDate])).toEqual([["2026-11-09", "2026-11-11"]]);
  });
  it("monthly on the 31st uses the last day of short months", () => {
    const e = ev({ startsAt: new Date("2026-01-31T09:00:00Z"), endsAt: new Date("2026-01-31T10:00:00Z"), freq: "MONTHLY" });
    expect(expandEvent(e, TZ, "2026-02-01", "2026-04-30").map((i) => i.startDate)).toEqual(["2026-02-28", "2026-03-31", "2026-04-30"]);
  });
});

describe("itemsOnDay and dashboard week", () => {
  const multi = expandEvent(ev({ allDay: true, startsAt: null, endsAt: null, startDate: "2026-11-16", endDate: "2026-11-18", title: "Ferien" }), TZ, "2026-11-01", "2026-11-30");
  const timed = expandEvent(ev({ id: "e2", title: "Zahnarzt", startsAt: new Date("2026-11-17T07:00:00Z"), endsAt: new Date("2026-11-17T08:00:00Z") }), TZ, "2026-11-01", "2026-11-30");
  const external = externalItem(
    { id: "x1", title: "Schulfest", description: null, location: null, allDay: true, startsAt: null, endsAt: null, startDate: "2026-11-17", endDate: "2026-11-17", calendarId: "c1", calendarName: "Schule", colorIndex: 2 },
    TZ,
  );
  it("multi-day items appear on every day they touch; all-day first, then by time", () => {
    const all = [...timed, ...multi, external];
    expect(itemsOnDay(all, "2026-11-15")).toHaveLength(0);
    expect(itemsOnDay(all, "2026-11-16").map((i) => i.title)).toEqual(["Ferien"]);
    expect(itemsOnDay(all, "2026-11-17").map((i) => i.title)).toEqual(["Ferien", "Schulfest", "Zahnarzt"]);
    expect(itemsOnDay(all, "2026-11-18").map((i) => i.title)).toEqual(["Ferien"]);
    expect(itemsOnDay(all, "2026-11-19")).toHaveLength(0);
  });
  it("external items are marked and carry calendar name and colour", () => {
    expect(external).toMatchObject({ source: "external", calendarName: "Schule", colorIndex: 2, repeats: false });
  });
  it("buildDashboard puts events and birthdays into the right day of the week (Mo-So)", () => {
    const d = buildDashboard(
      {
        familyName: "Familie Muster", timezone: TZ, profiles: [], tasks: [],
        birthdays: [{ id: "b1", name: "Oma Beispiel", month: 11, day: 19, birthYear: null }],
        events: [...timed, ...multi, external],
      },
      "u1",
      new Date("2026-11-17T10:00:00Z"),
    );
    expect(d.week.map((w) => w.iso)).toEqual(["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22"]);
    expect(d.week[1]!.events.map((i) => i.title)).toEqual(["Ferien", "Schulfest", "Zahnarzt"]);
    expect(d.week[3]!.events).toHaveLength(0);
    expect(d.week[3]!.birthdays.map((b) => b.name)).toEqual(["Oma Beispiel"]);
    expect(d.eventsToday.map((i) => i.title)).toEqual(["Ferien", "Schulfest", "Zahnarzt"]);
  });
});
