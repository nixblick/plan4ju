import { describe, expect, it } from "vitest";
import { ICS_LIMITS, IcsError, parseIcs } from "../src/server/ics";

const TZ = "Europe/Berlin";
const win = { from: new Date("2026-11-01T00:00:00Z"), to: new Date("2027-03-31T00:00:00Z") };
const cal = (...events: string[]) =>
  ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//example.test//Test//DE", ...events, "END:VCALENDAR"].join("\r\n");
const ev = (...lines: string[]) => ["BEGIN:VEVENT", ...lines, "END:VEVENT"].join("\r\n");

describe("parseIcs", () => {
  it("rejects anything that is not an iCalendar document", () => {
    expect(() => parseIcs("hello", TZ, win)).toThrow(IcsError);
    expect(() => parseIcs("<html></html>", TZ, win)).toThrow(IcsError);
    expect(() => parseIcs("BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\n", TZ, win)).toThrow(IcsError); // truncated
  });

  it("TZID without a VTIMEZONE in the file is read as that zone, not as UTC or floating", () => {
    const r = parseIcs(cal(ev("UID:1@example.test", "DTSTART;TZID=Europe/Berlin:20261116T180000", "DTEND;TZID=Europe/Berlin:20261116T190000", "SUMMARY:Chor")), "America/New_York", win);
    expect(r.events).toHaveLength(1);
    expect(r.events[0]!.startsAt!.toISOString()).toBe("2026-11-16T17:00:00.000Z");
    expect(r.events[0]!.endsAt!.toISOString()).toBe("2026-11-16T18:00:00.000Z");
  });

  it("a VTIMEZONE defined in the file is used", () => {
    const vtz = [
      "BEGIN:VTIMEZONE", "TZID:Mein/Zone", "BEGIN:STANDARD", "DTSTART:19700101T000000", "TZOFFSETFROM:+0300", "TZOFFSETTO:+0300", "TZNAME:MZ", "END:STANDARD", "END:VTIMEZONE",
    ].join("\r\n");
    const r = parseIcs(cal(vtz, ev("UID:2@example.test", "DTSTART;TZID=Mein/Zone:20261116T120000", "SUMMARY:X")), TZ, win);
    expect(r.events[0]!.startsAt!.toISOString()).toBe("2026-11-16T09:00:00.000Z");
  });

  it("UTC times and floating times (read in the family zone)", () => {
    const r = parseIcs(cal(ev("UID:3@example.test", "DTSTART:20261116T090000Z", "SUMMARY:U"), ev("UID:4@example.test", "DTSTART:20261116T090000", "SUMMARY:F")), TZ, win);
    const by = Object.fromEntries(r.events.map((e) => [e.uid, e.startsAt!.toISOString()]));
    expect(by["3@example.test"]).toBe("2026-11-16T09:00:00.000Z");
    expect(by["4@example.test"]).toBe("2026-11-16T08:00:00.000Z");
  });

  it("all-day: DTEND is exclusive", () => {
    const one = parseIcs(cal(ev("UID:5@example.test", "DTSTART;VALUE=DATE:20261120", "DTEND;VALUE=DATE:20261121", "SUMMARY:Ein Tag")), TZ, win).events[0]!;
    expect([one.allDay, one.startDate, one.endDate]).toEqual([true, "2026-11-20", "2026-11-20"]);
    const three = parseIcs(cal(ev("UID:6@example.test", "DTSTART;VALUE=DATE:20261120", "DTEND;VALUE=DATE:20261123", "SUMMARY:Drei Tage")), TZ, win).events[0]!;
    expect([three.startDate, three.endDate]).toEqual(["2026-11-20", "2026-11-22"]);
    const noEnd = parseIcs(cal(ev("UID:7@example.test", "DTSTART;VALUE=DATE:20261120", "SUMMARY:Ohne Ende")), TZ, win).events[0]!;
    expect(noEnd.endDate).toBe("2026-11-20");
  });

  it("expands RRULE with EXDATE and an overridden instance", () => {
    const r = parseIcs(
      cal(
        ev("UID:8@example.test", "DTSTART;TZID=Europe/Berlin:20261116T180000", "DTEND;TZID=Europe/Berlin:20261116T190000", "RRULE:FREQ=WEEKLY;COUNT=4", "EXDATE;TZID=Europe/Berlin:20261123T180000", "SUMMARY:Chor"),
        ev("UID:8@example.test", "RECURRENCE-ID;TZID=Europe/Berlin:20261130T180000", "DTSTART;TZID=Europe/Berlin:20261130T190000", "DTEND;TZID=Europe/Berlin:20261130T200000", "SUMMARY:Chor (später)"),
      ),
      TZ,
      win,
    );
    const starts = r.events.map((e) => `${e.startsAt!.toISOString()} ${e.title}`).sort();
    expect(starts).toEqual([
      "2026-11-16T17:00:00.000Z Chor",
      "2026-11-30T18:00:00.000Z Chor (später)",
      "2026-12-07T17:00:00.000Z Chor",
    ]);
  });

  it("keeps wall time across DST for a weekly rule", () => {
    const r = parseIcs(cal(ev("UID:9@example.test", "DTSTART;TZID=Europe/Berlin:20260320T180000", "RRULE:FREQ=WEEKLY;COUNT=3", "SUMMARY:W")), TZ, { from: new Date("2026-03-01"), to: new Date("2026-05-01") });
    expect(r.events.map((e) => e.startsAt!.toISOString()).sort()).toEqual(["2026-03-20T17:00:00.000Z", "2026-03-27T17:00:00.000Z", "2026-04-03T16:00:00.000Z"]);
  });

  it("only instances inside the window; old and far future events are dropped", () => {
    const r = parseIcs(cal(ev("UID:10@example.test", "DTSTART:20200101T100000Z", "SUMMARY:Alt"), ev("UID:11@example.test", "DTSTART:20300101T100000Z", "SUMMARY:Fern"), ev("UID:12@example.test", "DTSTART:20261201T100000Z", "SUMMARY:Jetzt")), TZ, win);
    expect(r.events.map((e) => e.title)).toEqual(["Jetzt"]);
  });

  it("an unbounded rule stops at the window end", () => {
    const r = parseIcs(cal(ev("UID:13@example.test", "DTSTART:20261101T080000Z", "RRULE:FREQ=DAILY", "SUMMARY:Täglich")), TZ, win);
    expect(r.events.length).toBeGreaterThan(100);
    expect(r.events.length).toBeLessThan(200);
  });

  it("a series that began years ago still reaches the window", () => {
    const w = { from: new Date("2026-11-01T00:00:00Z"), to: new Date("2026-11-30T00:00:00Z") };
    const daily = parseIcs(cal(ev("UID:20@example.test", "DTSTART:20100101T080000Z", "RRULE:FREQ=DAILY", "SUMMARY:Seit 2010")), TZ, w);
    expect(daily.truncated).toBe(false);
    expect(daily.events.length).toBeGreaterThanOrEqual(29);
    const weekdays = parseIcs(cal(ev("UID:21@example.test", "DTSTART;TZID=Europe/Berlin:20120102T090000", "RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR", "SUMMARY:Werktags")), TZ, w);
    expect(weekdays.events.length).toBeGreaterThanOrEqual(20);
    expect(weekdays.events.every((e) => e.startsAt!.getTime() >= w.from.getTime())).toBe(true);
  });

  it("a runaway rule is cut off and flagged instead of hanging", () => {
    const w = { from: new Date("2026-11-01T00:00:00Z"), to: new Date("2026-11-30T00:00:00Z") };
    const t0 = Date.now();
    const r = parseIcs(cal(ev("UID:22@example.test", "DTSTART:20000101T000000Z", "RRULE:FREQ=MINUTELY", "SUMMARY:Minütlich")), TZ, w);
    expect(r.truncated).toBe(true);
    expect(Date.now() - t0).toBeLessThan(15_000);
  });

  it("unfolds lines and keeps text, trims overlong text", () => {
    const r = parseIcs(cal(ev("UID:14@example.test", "DTSTART:20261201T100000Z", "SUMMARY:Ein sehr langer", " Titel", "LOCATION:Rathaus\\, Zimmer 3", "DESCRIPTION:Zeile 1\\nZeile 2")), TZ, win);
    expect(r.events[0]).toMatchObject({ title: "Ein sehr langerTitel", location: "Rathaus, Zimmer 3", description: "Zeile 1\nZeile 2" });
  });

  it("two events with the same uid and start collapse (no duplicates)", () => {
    const e = ev("UID:15@example.test", "DTSTART:20261201T100000Z", "SUMMARY:Doppelt");
    expect(parseIcs(cal(e, e), TZ, win).events).toHaveLength(1);
  });

  it("calendar name from X-WR-CALNAME", () => {
    const text = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//example.test//T//DE", "X-WR-CALNAME:Schulferien", "END:VCALENDAR"].join("\r\n");
    expect(parseIcs(text, TZ, win).calendarName).toBe("Schulferien");
  });

  describe("limits across the whole file", () => {
    const w = { from: new Date("2026-11-01T00:00:00Z"), to: new Date("2027-11-01T00:00:00Z") };
    const longRunning = (i: number) => ev(`UID:m${i}@example.test`, "DTSTART:19700101T080000Z", "RRULE:FREQ=DAILY", `SUMMARY:Serie ${i}`);

    it("many masters share one step budget (no per-master allowance)", () => {
      // 200 daily series since 1970: ~20 700 steps each, ~4.1 million in total without a shared budget
      const text = cal(...Array.from({ length: 200 }, (_, i) => longRunning(i)));
      const t0 = Date.now();
      const r = parseIcs(text, TZ, w, { maxSteps: 50_000 });
      const ms = Date.now() - t0;
      expect(r.truncated).toBe(true);
      expect(ms).toBeLessThan(5000);
    });

    it("the default budget also keeps a hostile file short", () => {
      const text = cal(...Array.from({ length: 500 }, (_, i) => longRunning(i)));
      const t0 = Date.now();
      const r = parseIcs(text, TZ, w);
      expect(r.truncated).toBe(true);
      expect(Date.now() - t0).toBeLessThan(ICS_LIMITS.maxMs + 2000);
    });

    it("stops all masters once maxEvents is reached", () => {
      const daily = (i: number) => ev(`UID:d${i}@example.test`, "DTSTART:20261101T080000Z", "RRULE:FREQ=DAILY", `SUMMARY:T ${i}`);
      const r = parseIcs(cal(...Array.from({ length: 50 }, (_, i) => daily(i))), TZ, w, { maxEvents: 300 });
      expect(r.truncated).toBe(true);
      expect(r.events).toHaveLength(300);
    });

    it("SECONDLY, MINUTELY and HOURLY rules are not expanded", () => {
      for (const freq of ["SECONDLY", "MINUTELY", "HOURLY"]) {
        const many = Array.from({ length: 100 }, (_, i) => ev(`UID:${freq}${i}@example.test`, "DTSTART:20261102T080000Z", `RRULE:FREQ=${freq}`, "SUMMARY:Takt"));
        const t0 = Date.now();
        const r = parseIcs(cal(...many), TZ, w);
        expect(Date.now() - t0).toBeLessThan(3000);
        expect(r.truncated).toBe(true);
        expect(r.events).toHaveLength(100); // only the first instance of each
      }
    });

    it("reads at most maxVevents components", () => {
      const singles = Array.from({ length: 50 }, (_, i) => ev(`UID:s${i}@example.test`, "DTSTART:20261201T100000Z", "SUMMARY:x"));
      const r = parseIcs(cal(...singles), TZ, w, { maxVevents: 20 });
      expect(r.events).toHaveLength(20);
      expect(r.truncated).toBe(true);
    });

    it("the deadline ends the expansion", () => {
      const text = cal(...Array.from({ length: 200 }, (_, i) => longRunning(i)));
      const t0 = Date.now();
      const r = parseIcs(text, TZ, w, { maxSteps: 10_000_000, maxMs: 200 });
      expect(r.truncated).toBe(true);
      expect(Date.now() - t0).toBeLessThan(2000);
    });
  });
});
