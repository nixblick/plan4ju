import { describe, expect, it } from "vitest";
import { addDays, birthdayIn, daysBetween, nextBirthday, todayIn, weekdayIndex, weekOf } from "../src/lib/week";
import { buildDashboard } from "../src/server/services/dashboard";

describe("week helpers", () => {
  it("weekOf returns Monday to Sunday", () => {
    // 2026-11-13 is a Friday
    expect(weekdayIndex("2026-11-13")).toBe(4);
    const w = weekOf("2026-11-13");
    expect(w[0]).toBe("2026-11-09");
    expect(w[6]).toBe("2026-11-15");
    expect(weekOf("2026-11-15")[0]).toBe("2026-11-09"); // Sunday belongs to the same week
    expect(weekOf("2026-11-09")[6]).toBe("2026-11-15");
  });
  it("crosses month and year boundaries", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(daysBetween("2026-12-30", "2027-01-02")).toBe(3);
    expect(weekOf("2026-12-31")).toContain("2027-01-03");
  });
  it("todayIn uses the family time zone", () => {
    const now = new Date("2026-11-13T23:30:00Z");
    expect(todayIn("Europe/Berlin", now)).toBe("2026-11-14");
    expect(todayIn("UTC", now)).toBe("2026-11-13");
    expect(todayIn("Not/AZone", now)).toBe("2026-11-14"); // falls back to Berlin
  });
  it("nextBirthday: today counts, past dates roll into next year, 29 Feb in non-leap years", () => {
    expect(nextBirthday(11, 13, "2026-11-13")).toBe("2026-11-13");
    expect(nextBirthday(11, 12, "2026-11-13")).toBe("2027-11-12");
    expect(nextBirthday(2, 29, "2026-11-13")).toBe("2027-02-28");
    expect(nextBirthday(2, 29, "2027-11-13")).toBe("2028-02-29");
    expect(birthdayIn(2026, 2, 29)).toBe("2026-02-28");
  });
});

describe("buildDashboard", () => {
  const raw = {
    familyName: "Familie Muster",
    timezone: "Europe/Berlin",
    profiles: [
      { id: "p1", displayName: "Anna", userId: "u1" },
      { id: "p2", displayName: "Kim", userId: null },
    ],
    tasks: [
      { id: "t1", title: "Einkaufen", due: "2026-11-13", done: false, assigneeIds: ["p1"] },
      { id: "t2", title: "Altpapier", due: "2026-11-10", done: false, assigneeIds: ["p2"] },
      { id: "t3", title: "Erledigt", due: "2026-11-13", done: true, assigneeIds: ["p1"] },
      { id: "t4", title: "Ohne Datum", due: null, done: false, assigneeIds: ["p1", "p2"] },
      { id: "t5", title: "Nächste Woche", due: "2026-11-16", done: false, assigneeIds: [] },
    ],
    birthdays: [
      { id: "b1", name: "Oma Muster", month: 11, day: 15, birthYear: 1950 },
      { id: "b2", name: "Opa Muster", month: 3, day: 1, birthYear: null },
    ],
  };
  const now = new Date("2026-11-13T10:00:00Z");
  const d = buildDashboard(raw, "u1", now);

  it("marks today and lists the seven days", () => {
    expect(d.week).toHaveLength(7);
    expect(d.week.filter((x) => x.isToday).map((x) => x.iso)).toEqual(["2026-11-13"]);
    expect(d.week[0]!.iso).toBe("2026-11-09");
  });
  it("puts tasks and birthdays on their day, not outside the week", () => {
    const fri = d.week.find((x) => x.iso === "2026-11-13")!;
    expect(fri.tasks.map((t) => t.id)).toEqual(["t1", "t3"]); // open before done
    expect(d.week.find((x) => x.iso === "2026-11-15")!.birthdays[0]).toMatchObject({ name: "Oma Muster", turns: 76 });
    expect(d.week.flatMap((x) => x.tasks).map((t) => t.id)).not.toContain("t5");
  });
  it("fills the tiles", () => {
    expect(d.mine.map((t) => t.id)).toEqual(["t1", "t4"]);
    expect(d.dueToday.map((t) => t.id)).toEqual(["t1"]);
    expect(d.overdue.map((t) => t.id)).toEqual(["t2"]);
    expect(d.nextBirthdays.map((b) => b.id)).toEqual(["b1", "b2"]);
    expect(d.nextBirthdays[0]!.inDays).toBe(2);
  });
  it("gives every person a fixed colour index in creation order; no own profile means no 'mine'", () => {
    expect(d.profiles.map((p) => p.colorIndex)).toEqual([0, 1]);
    expect(buildDashboard(raw, "someone-else", now).mine).toEqual([]);
  });
});
