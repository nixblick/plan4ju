import { describe, expect, it } from "vitest";
import type { CalendarItem } from "../src/lib/calendar-items";
import { agendaOf, barPosition, buildStrip, inLabel, nextUp, nowLine, nowMinutes } from "../src/lib/today-agenda";

const base = { source: "event" as const, description: null, location: null, repeats: false, calendarId: null, calendarName: null, colorIndex: null };
const ev = (p: Partial<CalendarItem> & { key: string; title: string }): CalendarItem => ({
  ...base, id: p.key, allDay: false, startDate: "2026-11-16", endDate: "2026-11-16", startTime: "09:00", endTime: "10:00", participantIds: [], ...p,
});
const today = "2026-11-16";

describe("agendaOf", () => {
  it("keeps timed events and timed open routines, drops all-day and skipped", () => {
    const a = agendaOf(
      today,
      [ev({ key: "e1", title: "Zahnarzt", startTime: "10:30", endTime: "11:15", participantIds: ["a"] }), ev({ key: "e2", title: "Fest", allDay: true, startTime: null, endTime: null })],
      [
        { id: "r1", title: "Kita holen", date: today, time: "08:00", status: "OPEN", assigneeIds: ["b"] },
        { id: "r2", title: "Ohne Zeit", date: today, time: null, status: "OPEN", assigneeIds: [] },
        { id: "r3", title: "Übersprungen", date: today, time: "09:00", status: "SKIPPED", assigneeIds: [] },
        { id: "r4", title: "Morgen", date: "2026-11-17", time: "09:00", status: "OPEN", assigneeIds: [] },
      ],
    );
    expect(a.map((x) => x.title)).toEqual(["Kita holen", "Zahnarzt"]);
    expect(a[1]).toMatchObject({ start: 630, end: 675, endTime: "11:15" });
    expect(a[0]).toMatchObject({ kind: "routine", end: 8 * 60 + 30 });
  });
  it("an event without end gets one hour; one that started yesterday begins at midnight", () => {
    const a = agendaOf(today, [ev({ key: "x", title: "Ohne Ende", startTime: "14:00", endTime: null }), ev({ key: "y", title: "Mehrtägig", startDate: "2026-11-15", endDate: "2026-11-17", startTime: "20:00", endTime: null })], []);
    expect(a.find((x) => x.title === "Ohne Ende")).toMatchObject({ start: 840, end: 900 });
    expect(a.find((x) => x.title === "Mehrtägig")).toMatchObject({ start: 0, end: 1440 });
  });
});

describe("nextUp", () => {
  const agenda = agendaOf(today, [ev({ key: "a", title: "A", startTime: "08:00" }), ev({ key: "b", title: "B", startTime: "08:30" }), ev({ key: "c", title: "C", startTime: "09:00" }), ev({ key: "d", title: "D", startTime: "10:00" }), ev({ key: "e", title: "E", startTime: "11:00" })], [
    { id: "r", title: "Erledigt", date: today, time: "07:50", status: "DONE", assigneeIds: [] },
  ]);
  it("next and the following three, in N minutes", () => {
    const n = nextUp(agenda, 7 * 60 + 27);
    expect(n.next?.title).toBe("A");
    expect(n.inMinutes).toBe(33);
    expect(n.after.map((x) => x.title)).toEqual(["B", "C", "D"]);
  });
  it("skips done routines and what has passed; nothing left gives null", () => {
    expect(nextUp(agenda, 7 * 60 + 45).next?.title).toBe("A");
    expect(nextUp(agenda, 12 * 60).next).toBeNull();
  });
});

describe("nextUp: running and multi-day", () => {
  it("shows an event that is running right now, with its real start", () => {
    const a = agendaOf(today, [ev({ key: "r", title: "Training", startTime: "09:00", endTime: "10:30" }), ev({ key: "l", title: "Später", startTime: "11:00" })], []);
    const n = nextUp(a, 9 * 60 + 40);
    expect(n.next?.title).toBe("Training");
    expect(n.running).toBe(true);
    expect(n.inMinutes).toBe(0);
    expect(n.next?.since).toBe("09:00");
    expect(n.after.map((x) => x.title)).toEqual(["Später"]);
    expect(nextUp(a, 10 * 60 + 30).next?.title).toBe("Später"); // ended exactly now
  });
  it("shows a multi-day event that began yesterday or earlier", () => {
    const y = agendaOf(today, [ev({ key: "y", title: "Klassenfahrt", startDate: "2026-11-15", startTime: "20:00", endDate: "2026-11-17", endTime: "12:00" })], []);
    const n = nextUp(y, 8 * 60);
    expect(n.next?.title).toBe("Klassenfahrt");
    expect(n.running).toBe(true);
    expect(n.next?.since).toBe("gestern 20:00");
    const older = agendaOf(today, [ev({ key: "o", title: "Kur", startDate: "2026-11-12", startTime: "08:00", endDate: "2026-11-16", endTime: "18:00" })], []);
    expect(nextUp(older, 17 * 60).next?.since).toBe("12.11. 08:00");
    expect(nextUp(older, 18 * 60).next).toBeNull();
  });
  it("a future entry is not running", () => {
    const n = nextUp(agendaOf(today, [ev({ key: "f", title: "F", startTime: "15:00" })], []), 14 * 60);
    expect(n.running).toBe(false);
    expect(n.inMinutes).toBe(60);
  });
});

describe("labels and strip", () => {
  it("inLabel", () => {
    expect(inLabel(0)).toBe("jetzt");
    expect(inLabel(1)).toBe("in 1 Minute");
    expect(inLabel(33)).toBe("in 33 Minuten");
    expect(inLabel(60)).toBe("in 1 Stunde");
    expect(inLabel(135)).toBe("in 2 Stunden 15 Min.");
  });
  it("positions clamp to 6-22 h", () => {
    expect(barPosition(6 * 60, 14 * 60)).toEqual({ left: 0, width: 50 });
    expect(barPosition(4 * 60, 7 * 60)).toEqual({ left: 0, width: 100 / 16 });
    expect(barPosition(22 * 60, 23 * 60)).toBeNull();
    expect(nowLine(14 * 60)).toBe(50);
    expect(nowLine(5 * 60)).toBeNull();
  });
  it("one row per person, multi-person entries in each, unassigned in an extra row", () => {
    const a = agendaOf(today, [ev({ key: "1", title: "Beide", participantIds: ["a", "b"] }), ev({ key: "2", title: "Alle", startTime: "12:00", endTime: "13:00" })], []);
    const rows = buildStrip(a, ["a", "b", "c"]);
    expect(rows.map((r) => [r.profileId, r.bars.length])).toEqual([["a", 1], ["b", 1], ["c", 0], [null, 1]]);
    expect(buildStrip([], ["a"]).length).toBe(1);
  });
  it("nowMinutes uses the family zone", () => {
    expect(nowMinutes(new Date("2026-11-16T07:12:00Z"), "Europe/Berlin")).toBe(8 * 60 + 12);
    expect(nowMinutes(new Date("2026-07-16T07:12:00Z"), "Europe/Berlin")).toBe(9 * 60 + 12);
  });
});
