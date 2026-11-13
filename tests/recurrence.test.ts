import { describe, expect, it } from "vitest";
import { describeRule, occurrencesBetween, type RecurrenceRule } from "../src/lib/recurrence";
import { addDays, todayIn } from "../src/lib/week";

const rule = (r: Partial<RecurrenceRule>): RecurrenceRule => ({
  freq: "DAILY", interval: 1, weekdays: [], monthDay: null, startDate: "2026-11-02", endDate: null, ...r,
});

describe("daily", () => {
  it("every day inside the range, never before the start", () => {
    expect(occurrencesBetween(rule({ startDate: "2026-11-04" }), "2026-11-01", "2026-11-06")).toEqual(["2026-11-04", "2026-11-05", "2026-11-06"]);
  });
  it("interval counts from the start date, independent of the window", () => {
    const r = rule({ interval: 3, startDate: "2026-11-02" });
    expect(occurrencesBetween(r, "2026-11-02", "2026-11-12")).toEqual(["2026-11-02", "2026-11-05", "2026-11-08", "2026-11-11"]);
    expect(occurrencesBetween(r, "2026-11-04", "2026-11-12")).toEqual(["2026-11-05", "2026-11-08", "2026-11-11"]);
  });
  it("respects the end date (inclusive)", () => {
    expect(occurrencesBetween(rule({ endDate: "2026-11-04" }), "2026-11-02", "2026-12-31")).toEqual(["2026-11-02", "2026-11-03", "2026-11-04"]);
  });
  it("empty when the window is before the start or after the end", () => {
    expect(occurrencesBetween(rule({}), "2026-10-01", "2026-10-31")).toEqual([]);
    expect(occurrencesBetween(rule({ endDate: "2026-11-05" }), "2026-12-01", "2026-12-31")).toEqual([]);
  });
  it("refuses unbounded ranges", () => {
    expect(() => occurrencesBetween(rule({}), "2026-01-01", "2030-01-01")).toThrow(RangeError);
  });
});

describe("weekly", () => {
  it("selected weekdays, Monday to Friday", () => {
    const r = rule({ freq: "WEEKLY", weekdays: [0, 1, 2, 3, 4] });
    expect(occurrencesBetween(r, "2026-11-02", "2026-11-09")).toEqual([
      "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-09",
    ]);
  });
  it("without weekdays it uses the weekday of the start date", () => {
    // 2026-11-04 is a Wednesday
    const r = rule({ freq: "WEEKLY", startDate: "2026-11-04" });
    expect(occurrencesBetween(r, "2026-11-01", "2026-11-20")).toEqual(["2026-11-04", "2026-11-11", "2026-11-18"]);
  });
  it("every second week counts weeks Monday to Sunday from the start week", () => {
    // start Sunday 2026-11-08 is the last day of week 0 (Mon 02.11.); Monday 09.11. starts week 1 (skipped)
    const r = rule({ freq: "WEEKLY", interval: 2, weekdays: [0, 6], startDate: "2026-11-08" });
    expect(occurrencesBetween(r, "2026-11-08", "2026-11-30")).toEqual(["2026-11-08", "2026-11-16", "2026-11-22", "2026-11-30"]);
  });
  it("Sunday belongs to the week that started on Monday", () => {
    const r = rule({ freq: "WEEKLY", interval: 2, weekdays: [0, 6], startDate: "2026-11-02" });
    expect(occurrencesBetween(r, "2026-11-02", "2026-11-30")).toEqual(["2026-11-02", "2026-11-08", "2026-11-16", "2026-11-22", "2026-11-30"]);
  });
  it("duplicate weekdays do not duplicate occurrences", () => {
    const r = rule({ freq: "WEEKLY", weekdays: [1, 1] });
    expect(occurrencesBetween(r, "2026-11-02", "2026-11-08")).toEqual(["2026-11-03"]);
  });
});

describe("monthly", () => {
  it("fixed day of month", () => {
    const r = rule({ freq: "MONTHLY", monthDay: 15, startDate: "2026-11-01" });
    expect(occurrencesBetween(r, "2026-11-01", "2027-02-28")).toEqual(["2026-11-15", "2026-12-15", "2027-01-15", "2027-02-15"]);
  });
  it("short months fall back to their last day (also leap years)", () => {
    const r = rule({ freq: "MONTHLY", monthDay: 31, startDate: "2027-12-01" });
    expect(occurrencesBetween(r, "2027-12-01", "2028-05-31")).toEqual([
      "2027-12-31", "2028-01-31", "2028-02-29", "2028-03-31", "2028-04-30", "2028-05-31",
    ]);
    expect(occurrencesBetween(rule({ freq: "MONTHLY", monthDay: 30, startDate: "2027-01-01" }), "2027-02-01", "2027-02-28")).toEqual(["2027-02-28"]);
  });
  it("start day is the default and the start month is not skipped when the day lies before it", () => {
    const r = rule({ freq: "MONTHLY", startDate: "2026-11-20" });
    expect(occurrencesBetween(r, "2026-11-01", "2027-01-31")).toEqual(["2026-11-20", "2026-12-20", "2027-01-20"]);
    const early = rule({ freq: "MONTHLY", monthDay: 5, startDate: "2026-11-20" });
    expect(occurrencesBetween(early, "2026-11-01", "2027-01-31")).toEqual(["2026-12-05", "2027-01-05"]);
  });
  it("every third month", () => {
    const r = rule({ freq: "MONTHLY", interval: 3, startDate: "2026-11-10" });
    expect(occurrencesBetween(r, "2026-11-01", "2027-12-31")).toEqual(["2026-11-10", "2027-02-10", "2027-05-10", "2027-08-10", "2027-11-10"]);
  });
});

describe("daylight saving time (Europe/Berlin)", () => {
  // Local days are plain dates, so the 23 h and 25 h days neither lose nor double an occurrence.
  it("daily routine across the spring change (29.03.2026) and the autumn change (25.10.2026)", () => {
    const spring = occurrencesBetween(rule({ startDate: "2026-03-26" }), "2026-03-26", "2026-04-01");
    expect(spring).toEqual(["2026-03-26", "2026-03-27", "2026-03-28", "2026-03-29", "2026-03-30", "2026-03-31", "2026-04-01"]);
    const autumn = occurrencesBetween(rule({ startDate: "2026-10-22" }), "2026-10-22", "2026-10-28");
    expect(autumn).toEqual(["2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25", "2026-10-26", "2026-10-27", "2026-10-28"]);
  });
  it("weekly Sunday routine hits exactly the change Sundays", () => {
    const r = rule({ freq: "WEEKLY", weekdays: [6], startDate: "2026-03-01" });
    expect(occurrencesBetween(r, "2026-03-22", "2026-04-05")).toEqual(["2026-03-22", "2026-03-29", "2026-04-05"]);
  });
  it("the family's today follows its local midnight across the change", () => {
    // 29.03.2026 02:00 CET -> 03:00 CEST. 28.03. 23:30 UTC is already 29.03. 00:30 local time.
    expect(todayIn("Europe/Berlin", new Date("2026-03-28T22:59:00Z"))).toBe("2026-03-28");
    expect(todayIn("Europe/Berlin", new Date("2026-03-28T23:00:00Z"))).toBe("2026-03-29");
    // 25.10.2026 03:00 CEST -> 02:00 CET. Local midnight of the 26th is 23:00 UTC on the 25th.
    expect(todayIn("Europe/Berlin", new Date("2026-10-24T22:00:00Z"))).toBe("2026-10-25");
    expect(todayIn("Europe/Berlin", new Date("2026-10-25T22:59:00Z"))).toBe("2026-10-25");
    expect(todayIn("Europe/Berlin", new Date("2026-10-25T23:00:00Z"))).toBe("2026-10-26");
    // another zone is not the same day at the same instant
    expect(todayIn("Pacific/Auckland", new Date("2026-03-28T22:59:00Z"))).toBe("2026-03-29");
  });
  it("a window computed from today across the change has no gap", () => {
    const today = todayIn("Europe/Berlin", new Date("2026-03-28T23:30:00Z"));
    const days = occurrencesBetween(rule({ startDate: "2026-01-01" }), today, addDays(today, 3));
    expect(days).toEqual(["2026-03-29", "2026-03-30", "2026-03-31", "2026-04-01"]);
  });
});

describe("describeRule", () => {
  it("reads naturally in German", () => {
    expect(describeRule(rule({}))).toBe("täglich");
    expect(describeRule(rule({ interval: 2 }))).toBe("alle 2 Tage");
    expect(describeRule(rule({ freq: "WEEKLY", weekdays: [0, 1, 2, 3, 4] }))).toBe("Mo–Fr (jede Woche)");
    expect(describeRule(rule({ freq: "WEEKLY", weekdays: [5, 1], interval: 2 }))).toBe("Di, Sa (alle 2 Wochen)");
    expect(describeRule(rule({ freq: "MONTHLY", monthDay: 31 }))).toBe("monatlich am 31.");
  });
});
