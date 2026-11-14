import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, app, cleanup, seed, type Fixture } from "./helpers";
import { DayTakenError, NotFoundError } from "../src/server/errors";
import { expandEvent, type RawEvent } from "../src/lib/calendar-items";
import { createEvent, getEventInstance, listItems, resetEventInstance, setEventInstance, updateEvent, getEvent } from "../src/server/services/calendar";
import { createRoutine, listOccurrences, moveOccurrence, setRoutineStatus, updateRoutine } from "../src/server/services/routines";

let f: Fixture;
beforeAll(async () => {
  f = await seed();
});
afterAll(async () => {
  await cleanup(f);
  await app.$disconnect();
  await admin.$disconnect();
});

const TZ = "Europe/Berlin";

describe("expandEvent with exceptions (pure)", () => {
  // Weekly on Monday 09:00 Berlin, from 19.10.2026 (summer time) over the change on 25.10.2026.
  const ev: RawEvent = {
    id: "e", title: "Training", description: null, location: null, allDay: false,
    startsAt: new Date("2026-10-19T07:00:00Z"), endsAt: new Date("2026-10-19T08:00:00Z"), startDate: null, endDate: null,
    freq: "WEEKLY", interval: 1, weekdays: [0], monthDay: null, repeatUntil: null, participantIds: [],
  };

  it("keeps the wall clock time across DST without exceptions", () => {
    const items = expandEvent(ev, TZ, "2026-10-19", "2026-11-02");
    expect(items.map((i) => [i.startDate, i.startTime, i.seriesDate, i.moved])).toEqual([
      ["2026-10-19", "09:00", "2026-10-19", false],
      ["2026-10-26", "09:00", "2026-10-26", false],
      ["2026-11-02", "09:00", "2026-11-02", false],
    ]);
  });

  it("drops a cancelled instance and shows a moved one at its new time, marked as moved", () => {
    const items = expandEvent(
      {
        ...ev,
        exceptions: [
          { date: "2026-10-26", cancelled: true, startsAt: null, endsAt: null, startDate: null, endDate: null },
          // 19.10. (CEST) moved to Tuesday 27.10. 18:00 (CET = UTC+1)
          { date: "2026-10-19", cancelled: false, startsAt: new Date("2026-10-27T17:00:00Z"), endsAt: new Date("2026-10-27T18:00:00Z"), startDate: null, endDate: null },
        ],
      },
      TZ, "2026-10-19", "2026-11-02",
    );
    expect(items.map((i) => [i.startDate, i.startTime, i.endTime, i.seriesDate, i.moved])).toEqual([
      ["2026-11-02", "09:00", "10:00", "2026-11-02", false],
      ["2026-10-27", "18:00", "19:00", "2026-10-19", true],
    ]);
  });

  it("a moved instance shows up in a window that does not contain its rule day", () => {
    const items = expandEvent(
      { ...ev, exceptions: [{ date: "2026-10-19", cancelled: false, startsAt: new Date("2026-11-04T08:00:00Z"), endsAt: new Date("2026-11-04T09:00:00Z"), startDate: null, endDate: null }] },
      TZ, "2026-11-04", "2026-11-04",
    );
    expect(items.map((i) => [i.startDate, i.startTime, i.moved])).toEqual([["2026-11-04", "09:00", true]]);
  });

  it("ignores exceptions on days that are no longer rule days", () => {
    const items = expandEvent(
      { ...ev, exceptions: [{ date: "2026-10-20", cancelled: false, startsAt: new Date("2026-10-21T08:00:00Z"), endsAt: new Date("2026-10-21T09:00:00Z"), startDate: null, endDate: null }] },
      TZ, "2026-10-19", "2026-10-25",
    );
    expect(items.map((i) => i.startDate)).toEqual(["2026-10-19"]);
  });
});

describe("calendar: single instances of a series", () => {
  it("moves one instance across the DST change; the series and other instances stay", async () => {
    const e = await createEvent(f.userA, f.familyA, { title: "Chor", startDate: "2026-10-19", startTime: "09:00", endTime: "10:00", freq: "WEEKLY", weekdays: [0] }, app);
    // 19.10. is summer time; move it to Wednesday 28.10. (winter time), keep the times.
    await setEventInstance(f.userA, f.familyA, e.id, { date: "2026-10-19", startDate: "2026-10-28" }, app);
    const x = await admin.calendarEventException.findFirstOrThrow({ where: { eventId: e.id } });
    expect(x.startsAt!.toISOString()).toBe("2026-10-28T08:00:00.000Z"); // 09:00 CET
    const items = (await listItems(f.userA, f.familyA, "2026-10-19", "2026-11-02", app)).filter((i) => i.id === e.id);
    expect(items.map((i) => [i.startDate, i.startTime, i.moved])).toEqual([
      ["2026-10-26", "09:00", false],
      ["2026-10-28", "09:00", true],
      ["2026-11-02", "09:00", false],
    ]);
    const inst = await getEventInstance(f.userA, f.familyA, e.id, "2026-10-19", app);
    expect([inst!.moved, inst!.startDate, inst!.startTime, inst!.endTime]).toEqual([true, "2026-10-28", "09:00", "10:00"]);

    // Changing the series keeps the moved instance.
    const form = await getEvent(f.userA, f.familyA, e.id, app);
    await updateEvent(f.userA, f.familyA, e.id, { ...form, title: "Chorprobe" }, app);
    const after = (await listItems(f.userA, f.familyA, "2026-10-28", "2026-10-28", app)).filter((i) => i.id === e.id);
    expect(after.map((i) => [i.title, i.moved])).toEqual([["Chorprobe", true]]);

    // Moving to a new time on a summer-time day (backwards in time) uses CEST.
    await setEventInstance(f.userA, f.familyA, e.id, { date: "2026-10-26", startDate: "2026-10-24", startTime: "15:30", endTime: "16:00" }, app);
    const y = await admin.calendarEventException.findFirstOrThrow({ where: { eventId: e.id, date: new Date("2026-10-26T00:00:00Z") } });
    expect([y.startsAt!.toISOString(), y.endsAt!.toISOString()]).toEqual(["2026-10-24T13:30:00.000Z", "2026-10-24T14:00:00.000Z"]);
  });

  it("cancels one instance and resets it again", async () => {
    const e = await createEvent(f.userA, f.familyA, { title: "Müll raus", allDay: true, startDate: "2026-11-02", freq: "WEEKLY", weekdays: [0] }, app);
    await setEventInstance(f.userA, f.familyA, e.id, { date: "2026-11-09", cancelled: true }, app);
    const days = async () => (await listItems(f.userA, f.familyA, "2026-11-02", "2026-11-16", app)).filter((i) => i.id === e.id).map((i) => i.startDate);
    expect(await days()).toEqual(["2026-11-02", "2026-11-16"]);
    expect((await getEventInstance(f.userA, f.familyA, e.id, "2026-11-09", app))!.cancelled).toBe(true);
    await resetEventInstance(f.userA, f.familyA, e.id, "2026-11-09", app);
    expect(await days()).toEqual(["2026-11-02", "2026-11-09", "2026-11-16"]);
    // all day: moved to another day range
    await setEventInstance(f.userA, f.familyA, e.id, { date: "2026-11-16", startDate: "2026-11-17", endDate: "2026-11-18" }, app);
    const moved = (await listItems(f.userA, f.familyA, "2026-11-16", "2026-11-18", app)).filter((i) => i.id === e.id);
    expect(moved.map((i) => [i.startDate, i.endDate, i.moved])).toEqual([["2026-11-17", "2026-11-18", true]]);
  });

  it("a long daily series with many old exceptions still hides today's cancellation", async () => {
    const e = await createEvent(f.userA, f.familyA, { title: "Hund raus", allDay: true, startDate: "2024-01-01", freq: "DAILY" }, app);
    // 600 cancelled days long before the window, then one cancellation inside it.
    const data = Array.from({ length: 600 }, (_, i) => ({ familyId: f.familyA, eventId: e.id, date: new Date(Date.UTC(2024, 0, 1 + i)), cancelled: true }));
    await admin.calendarEventException.createMany({ data });
    await setEventInstance(f.userA, f.familyA, e.id, { date: "2026-11-11", cancelled: true }, app);
    const days = (await listItems(f.userA, f.familyA, "2026-11-10", "2026-11-12", app)).filter((i) => i.id === e.id).map((i) => i.startDate);
    expect(days).toEqual(["2026-11-10", "2026-11-12"]);
  });

  it("shows an instance moved behind the end of the series", async () => {
    const e = await createEvent(f.userA, f.familyA, { title: "Kurzkurs", startDate: "2026-10-19", startTime: "09:00", endTime: "10:00", freq: "WEEKLY", weekdays: [0], repeatUntil: "2026-10-26" }, app);
    await setEventInstance(f.userA, f.familyA, e.id, { date: "2026-10-26", startDate: "2026-11-11" }, app);
    const items = (await listItems(f.userA, f.familyA, "2026-11-09", "2026-11-15", app)).filter((i) => i.id === e.id);
    expect(items.map((i) => [i.startDate, i.startTime, i.moved])).toEqual([["2026-11-11", "09:00", true]]);
  });

  it("refuses days that are not in the series, one-off events and other families", async () => {
    const e = await createEvent(f.userA, f.familyA, { title: "Kurs", startDate: "2026-11-03", startTime: "18:00", freq: "WEEKLY", weekdays: [1] }, app);
    await expect(setEventInstance(f.userA, f.familyA, e.id, { date: "2026-11-04", cancelled: true }, app)).rejects.toBeInstanceOf(NotFoundError);
    const once = await createEvent(f.userA, f.familyA, { title: "Einmal", startDate: "2026-11-03", startTime: "18:00" }, app);
    await expect(setEventInstance(f.userA, f.familyA, once.id, { date: "2026-11-03", cancelled: true }, app)).rejects.toBeInstanceOf(NotFoundError);
    await expect(setEventInstance(f.userB, f.familyB, e.id, { date: "2026-11-03", cancelled: true }, app)).rejects.toBeInstanceOf(NotFoundError);
    expect(await getEventInstance(f.userB, f.familyB, e.id, "2026-11-03", app)).toBeNull();
    await expect(setEventInstance(f.userA, f.familyA, e.id, { date: "2026-11-03", startDate: "2026-11-05", startTime: "18:00", endTime: "17:00" }, app)).rejects.toThrow();
    expect(await admin.calendarEventException.count({ where: { eventId: e.id } })).toBe(0);
  });
});

describe("routines: move one occurrence", () => {
  const NOW = new Date("2026-10-22T10:00:00Z");

  it("moves to another day and time over DST; the rule day is not generated again, even after a routine change", async () => {
    const r = await createRoutine(f.userA, f.familyA, { title: "Blumen gießen", freq: "DAILY", startDate: "2026-10-22", endDate: "2026-10-28", timeOfDay: "08:00" }, app, NOW);
    const occ = async () => (await listOccurrences(f.userA, f.familyA, "2026-10-22", "2026-11-05", app, NOW)).filter((o) => o.routineId === r.id);
    const sat = (await occ()).find((o) => o.date === "2026-10-24")!;
    // DAILY until 28.10.: move 24.10. (summer time) to 30.10. (winter time) at 19:15.
    await moveOccurrence(f.userA, f.familyA, sat.id, { date: "2026-10-30", time: "19:15" }, app);
    let list = await occ();
    expect(list.map((o) => o.date)).toEqual(["2026-10-22", "2026-10-23", "2026-10-25", "2026-10-26", "2026-10-27", "2026-10-28", "2026-10-30"]);
    const moved = list.find((o) => o.id === sat.id)!;
    expect([moved.time, moved.movedFrom, moved.customized]).toEqual(["19:15", "2026-10-24", true]);

    await updateRoutine(f.userA, f.familyA, r.id, { title: "Blumen gießen!", freq: "DAILY", startDate: "2026-10-22", endDate: "2026-10-28", timeOfDay: "08:30" }, app, NOW);
    list = await occ();
    expect(list.filter((o) => o.date === "2026-10-24")).toHaveLength(0);
    expect(list.find((o) => o.id === sat.id)!.time).toBe("19:15");
    expect(list.find((o) => o.date === "2026-10-25")!.time).toBe("08:30");

    // Moving it back to its rule day clears the mark.
    await moveOccurrence(f.userA, f.familyA, sat.id, { date: "2026-10-24", time: "08:30" }, app);
    expect((await occ()).find((o) => o.id === sat.id)!.movedFrom).toBeNull();

    // A day that already has an occurrence of this routine is refused.
    await expect(moveOccurrence(f.userA, f.familyA, sat.id, { date: "2026-10-25" }, app)).rejects.toBeInstanceOf(DayTakenError);
    // Other families do not see it.
    await expect(moveOccurrence(f.userB, f.familyB, sat.id, { date: "2026-10-29" }, app)).rejects.toBeInstanceOf(NotFoundError);
    await setRoutineStatus(f.userA, f.familyA, r.id, "ARCHIVED", app, NOW);
  });
});
