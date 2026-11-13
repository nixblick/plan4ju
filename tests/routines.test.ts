import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, app, cleanup, seed, type Fixture } from "./helpers";
import { ForbiddenError, NotFoundError } from "../src/server/errors";
import {
  createRoutine, getRoutine, listOccurrences, listRoutines, setOccurrenceAssignees, setOccurrenceStatus,
  setRoutineStatus, updateRoutine, HORIZON_DAYS,
} from "../src/server/services/routines";
import { createTask, findTasks, setTaskArchived, setTaskStatus, updateTask } from "../src/server/services/tasks";
import { getDashboard } from "../src/server/services/dashboard";
import { addDays } from "../src/lib/week";

let f: Fixture;
let second: string; // second profile of family A
beforeAll(async () => {
  f = await seed();
  second = (await admin.familyProfile.create({ data: { familyId: f.familyA, displayName: "Ben Muster" } })).id;
});
afterAll(async () => {
  await cleanup(f);
  await app.$disconnect();
  await admin.$disconnect();
});

// Monday 09.11.2026, 10:00 in Berlin.
const NOW = new Date("2026-11-09T09:00:00Z");
const TODAY = "2026-11-09";
const base = { title: "Abendessen kochen", freq: "DAILY" as const, startDate: TODAY };
const range = (days: number) => [TODAY, addDays(TODAY, days)] as const;

describe("routines: creation and window", () => {
  it("creates a bounded window of occurrences, not all future ones", async () => {
    const r = await createRoutine(f.userA, f.familyA, { ...base, assigneeIds: [f.profileA] }, app, NOW);
    const all = await listOccurrences(f.userA, f.familyA, TODAY, addDays(TODAY, 400), app, NOW);
    const mine = all.filter((o) => o.routineId === r.id);
    expect(mine).toHaveLength(HORIZON_DAYS + 1); // today .. today + 56
    expect(mine[0]!.date).toBe(TODAY);
    expect(mine.at(-1)!.date).toBe(addDays(TODAY, HORIZON_DAYS));
    expect(mine.every((o) => o.assigneeIds.join() === f.profileA)).toBe(true);
    await setRoutineStatus(f.userA, f.familyA, r.id, "ARCHIVED", app, NOW);
  });

  it("does not create occurrences in the past, and tops up later without duplicates", async () => {
    const r = await createRoutine(f.userA, f.familyA, { ...base, title: "Kita bringen", startDate: "2026-10-01", freq: "WEEKLY", weekdays: [0, 1, 2, 3, 4] }, app, NOW);
    const first = (await listOccurrences(f.userA, f.familyA, "2026-10-01", addDays(TODAY, 400), app, NOW)).filter((o) => o.routineId === r.id);
    expect(first[0]!.date).toBe(TODAY);
    expect(first.every((o) => o.date >= TODAY)).toBe(true);
    // five weeks later the window is topped up; parallel renderings do not duplicate rows
    const later = new Date("2026-12-14T09:00:00Z");
    await Promise.all([1, 2, 3].map(() => listOccurrences(f.userA, f.familyA, "2026-12-14", "2026-12-14", app, later)));
    const rows = await admin.routineOccurrence.findMany({ where: { routineId: r.id }, orderBy: { date: "asc" } });
    expect(new Set(rows.map((x) => x.date.toISOString())).size).toBe(rows.length);
    expect(rows.at(-1)!.date.toISOString().slice(0, 10) >= "2027-02-01").toBe(true);
    await setRoutineStatus(f.userA, f.familyA, r.id, "ARCHIVED", app, NOW);
  });

  it("validates input", async () => {
    await expect(createRoutine(f.userA, f.familyA, { ...base, title: " " }, app, NOW)).rejects.toThrow();
    await expect(createRoutine(f.userA, f.familyA, { ...base, startDate: "2026-02-31" }, app, NOW)).rejects.toThrow();
    await expect(createRoutine(f.userA, f.familyA, { ...base, endDate: "2026-11-01" }, app, NOW)).rejects.toThrow();
    await expect(createRoutine(f.userA, f.familyA, { ...base, interval: 0 }, app, NOW)).rejects.toThrow();
    await expect(createRoutine(f.userA, f.familyA, { ...base, timeOfDay: "25:00" }, app, NOW)).rejects.toThrow();
  });
});

describe("routines: assignment modes", () => {
  it("fixed (several persons), rotating, and per occurrence", async () => {
    const fixed = await createRoutine(f.userA, f.familyA, { ...base, title: "Fest", endDate: addDays(TODAY, 2), assigneeIds: [f.profileA, second] }, app, NOW);
    const rot = await createRoutine(f.userA, f.familyA, { ...base, title: "Wechsel", endDate: addDays(TODAY, 3), assignMode: "ROTATING", assigneeIds: [second, f.profileA] }, app, NOW);
    const per = await createRoutine(f.userA, f.familyA, { ...base, title: "Einzeln", endDate: addDays(TODAY, 1), assignMode: "PER_OCCURRENCE", assigneeIds: [f.profileA] }, app, NOW);
    const occ = await listOccurrences(f.userA, f.familyA, ...range(5), app, NOW);
    const of = (id: string) => occ.filter((o) => o.routineId === id);
    expect(of(fixed.id).map((o) => [...o.assigneeIds].sort())).toEqual([[f.profileA, second].sort(), [f.profileA, second].sort(), [f.profileA, second].sort()]);
    expect(of(rot.id).map((o) => o.assigneeIds)).toEqual([[second], [f.profileA], [second], [f.profileA]]);
    expect(of(per.id).map((o) => o.assigneeIds)).toEqual([[], []]);
    for (const r of [fixed, rot, per]) await setRoutineStatus(f.userA, f.familyA, r.id, "ARCHIVED", app, NOW);
  });

  it("a foreign profile cannot be assigned", async () => {
    await expect(createRoutine(f.userA, f.familyA, { ...base, assigneeIds: [f.profileB] }, app, NOW)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("routines: occurrences and changes", () => {
  it("done / skipped / customized occurrences survive a change of the routine", async () => {
    const r = await createRoutine(f.userA, f.familyA, { ...base, title: "Ins Bett bringen", endDate: addDays(TODAY, 9), assigneeIds: [f.profileA] }, app, NOW);
    const occ = (await listOccurrences(f.userA, f.familyA, ...range(9), app, NOW)).filter((o) => o.routineId === r.id);
    const [d0, d1, d2, d3] = occ;
    await setOccurrenceStatus(f.userA, f.familyA, d0!.id, "DONE", app);
    await setOccurrenceStatus(f.userA, f.familyA, d1!.id, "SKIPPED", app);
    await setOccurrenceAssignees(f.userA, f.familyA, d2!.id, [second], app);

    // change: other person fixed, only every second day, shorter
    await updateRoutine(f.userA, f.familyA, r.id, { ...base, title: "Ins Bett bringen", interval: 2, endDate: addDays(TODAY, 9), assigneeIds: [second] }, app, NOW);
    const after = (await listOccurrences(f.userA, f.familyA, ...range(9), app, NOW)).filter((o) => o.routineId === r.id);
    const byDate = new Map(after.map((o) => [o.date, o]));
    expect(byDate.get(d0!.date)!.status).toBe("DONE");
    expect(byDate.get(d0!.date)!.assigneeIds).toEqual([f.profileA]); // done one keeps its old person
    expect(byDate.get(d1!.date)!.status).toBe("SKIPPED");
    expect(byDate.get(d2!.date)!.assigneeIds).toEqual([second]);
    expect(byDate.get(d2!.date)!.customized).toBe(true);
    // untouched day 3 (odd day count) is gone, regenerated days follow the new rule and person
    expect(byDate.has(d3!.date)).toBe(false);
    for (const d of [4, 6, 8]) {
      const o = byDate.get(addDays(TODAY, d))!;
      expect(o.assigneeIds).toEqual([second]);
      expect(o.status).toBe("OPEN");
    }
    expect(after.filter((o) => o.status === "OPEN" && !o.customized).every((o) => o.assigneeIds.join() === second)).toBe(true);
    await setRoutineStatus(f.userA, f.familyA, r.id, "ARCHIVED", app, NOW);
  });

  it("pause removes untouched future occurrences, resume brings them back, archive hides the routine", async () => {
    const r = await createRoutine(f.userA, f.familyA, { ...base, title: "Pausentest", endDate: addDays(TODAY, 5) }, app, NOW);
    const [first] = (await listOccurrences(f.userA, f.familyA, ...range(5), app, NOW)).filter((o) => o.routineId === r.id);
    await setOccurrenceStatus(f.userA, f.familyA, first!.id, "DONE", app);
    await setRoutineStatus(f.userA, f.familyA, r.id, "PAUSED", app, NOW);
    expect((await listOccurrences(f.userA, f.familyA, ...range(5), app, NOW)).filter((o) => o.routineId === r.id)).toHaveLength(0);
    expect((await admin.routineOccurrence.findMany({ where: { routineId: r.id } })).map((o) => o.status)).toEqual(["DONE"]);
    await setRoutineStatus(f.userA, f.familyA, r.id, "ACTIVE", app, NOW);
    const back = (await listOccurrences(f.userA, f.familyA, ...range(5), app, NOW)).filter((o) => o.routineId === r.id);
    expect(back).toHaveLength(6);
    expect(back[0]!.status).toBe("DONE");
    await setRoutineStatus(f.userA, f.familyA, r.id, "ARCHIVED", app, NOW);
    expect((await listRoutines(f.userA, f.familyA, false, app)).some((x) => x.id === r.id)).toBe(false);
    expect((await listRoutines(f.userA, f.familyA, true, app)).some((x) => x.id === r.id)).toBe(true);
  });

  it("done is undone again and records who did it", async () => {
    const r = await createRoutine(f.userA, f.familyA, { ...base, title: "Abhaken", endDate: TODAY }, app, NOW);
    const [o] = (await listOccurrences(f.userA, f.familyA, ...range(0), app, NOW)).filter((x) => x.routineId === r.id);
    await setOccurrenceStatus(f.userA, f.familyA, o!.id, "DONE", app);
    const row = await admin.routineOccurrence.findUniqueOrThrow({ where: { id: o!.id } });
    expect([row.status, row.doneById, row.doneAt !== null]).toEqual(["DONE", f.userA, true]);
    await setOccurrenceStatus(f.userA, f.familyA, o!.id, "OPEN", app);
    const open = await admin.routineOccurrence.findUniqueOrThrow({ where: { id: o!.id } });
    expect([open.status, open.doneById, open.doneAt]).toEqual(["OPEN", null, null]);
    await setRoutineStatus(f.userA, f.familyA, r.id, "ARCHIVED", app, NOW);
  });

  it("DST: daily routine over the autumn change has one occurrence per local day", async () => {
    const before = new Date("2026-10-22T10:00:00Z");
    const r = await createRoutine(f.userA, f.familyA, { ...base, title: "Zeitumstellung", startDate: "2026-10-22", endDate: "2026-10-28" }, app, before);
    const occ = (await listOccurrences(f.userA, f.familyA, "2026-10-22", "2026-10-28", app, before)).filter((o) => o.routineId === r.id);
    expect(occ.map((o) => o.date)).toEqual(["2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25", "2026-10-26", "2026-10-27", "2026-10-28"]);
    await setRoutineStatus(f.userA, f.familyA, r.id, "ARCHIVED", app, before);
  });

  it("the family time zone decides what 'today' is when occurrences are created", async () => {
    await admin.family.update({ where: { id: f.familyA }, data: { timezone: "Pacific/Auckland" } });
    try {
      // 08.11. 23:30 UTC is already 09.11. 12:30 in Auckland but still 09.11. 00:30 in Berlin; use 09.11. 11:30 UTC:
      // Auckland is on the 10th, Berlin on the 9th.
      const t = new Date("2026-11-09T11:30:00Z");
      const r = await createRoutine(f.userA, f.familyA, { ...base, title: "Zeitzone", startDate: "2026-11-01", endDate: "2026-11-12" }, app, t);
      const occ = await admin.routineOccurrence.findMany({ where: { routineId: r.id }, orderBy: { date: "asc" } });
      expect(occ[0]!.date.toISOString().slice(0, 10)).toBe("2026-11-10");
      await setRoutineStatus(f.userA, f.familyA, r.id, "ARCHIVED", app, t);
    } finally {
      await admin.family.update({ where: { id: f.familyA }, data: { timezone: "Europe/Berlin" } });
    }
  });
});

describe("routines: isolation between families", () => {
  it("foreign routine / occurrence ids give NotFound, other families are Forbidden", async () => {
    await expect(getRoutine(f.userA, f.familyA, f.routineB, app)).rejects.toBeInstanceOf(NotFoundError);
    await expect(updateRoutine(f.userA, f.familyA, f.routineB, base, app, NOW)).rejects.toBeInstanceOf(NotFoundError);
    await expect(setRoutineStatus(f.userA, f.familyA, f.routineB, "ARCHIVED", app, NOW)).rejects.toBeInstanceOf(NotFoundError);
    await expect(setOccurrenceStatus(f.userA, f.familyA, f.occurrenceB, "DONE", app)).rejects.toBeInstanceOf(NotFoundError);
    await expect(setOccurrenceAssignees(f.userA, f.familyA, f.occurrenceB, [f.profileA], app)).rejects.toBeInstanceOf(NotFoundError);
    await expect(listRoutines(f.userA, f.familyB, false, app)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(createRoutine(f.userA, f.familyB, base, app, NOW)).rejects.toBeInstanceOf(ForbiddenError);
    expect((await listRoutines(f.userA, f.familyA, true, app)).some((r) => r.id === f.routineB)).toBe(false);
    expect((await admin.routineOccurrence.findUniqueOrThrow({ where: { id: f.occurrenceB } })).status).toBe("OPEN");
    expect((await admin.routineOccurrenceAssignment.findMany({ where: { occurrenceId: f.occurrenceB } })).map((a) => a.profileId)).toEqual([f.profileB]);
  });
});

describe("dashboard shows routines", () => {
  it("today's and the week's occurrences of the own family only", async () => {
    const r = await createRoutine(f.userA, f.familyA, { ...base, title: "Dashboard-Routine", endDate: addDays(TODAY, 1), assigneeIds: [f.profileA], timeOfDay: "18:00" }, app, NOW);
    const d = await getDashboard(f.userA, f.familyA, NOW, app);
    expect(d.routinesToday.filter((o) => o.routineId === r.id)).toHaveLength(1);
    expect(d.week.flatMap((x) => x.routines).filter((o) => o.routineId === r.id).map((o) => o.date)).toEqual([TODAY, "2026-11-10"]);
    const other = JSON.stringify(await getDashboard(f.userB, f.familyB, NOW, app));
    expect(other).not.toContain("Dashboard-Routine");
    // skipped ones are hidden
    const [o] = d.routinesToday.filter((x) => x.routineId === r.id);
    await setOccurrenceStatus(f.userA, f.familyA, o!.id, "SKIPPED", app);
    expect((await getDashboard(f.userA, f.familyA, NOW, app)).routinesToday.filter((x) => x.routineId === r.id)).toHaveLength(0);
    await setRoutineStatus(f.userA, f.familyA, r.id, "ARCHIVED", app, NOW);
  });
});

describe("tasks: extended features", () => {
  it("priority, time, in-progress, done timestamps and description", async () => {
    const t = await createTask(f.userA, f.familyA, { title: "Mit Details", description: " Text ", dueDate: "2026-11-20", dueTime: "09:30", priority: "HIGH" }, app);
    expect([t.priority, t.dueTime, t.description, t.status]).toEqual(["HIGH", "09:30", "Text", "OPEN"]);
    await expect(createTask(f.userA, f.familyA, { title: "x", dueTime: "09:30" }, app)).rejects.toThrow();
    await expect(createTask(f.userA, f.familyA, { title: "x", dueDate: "2026-11-20", dueTime: "9:5" }, app)).rejects.toThrow();
    await setTaskStatus(f.userA, f.familyA, t.id, "IN_PROGRESS", app);
    expect((await findTasks(f.userA, f.familyA, { filter: "offen" }, app)).some((x) => x.id === t.id)).toBe(true);
    const u = await updateTask(f.userA, f.familyA, t.id, { title: "Mit Details", status: "DONE", priority: "LOW" }, app);
    expect([u.status, u.priority, u.dueTime, u.doneAt !== null]).toEqual(["DONE", "LOW", null, true]);
    const kept = await updateTask(f.userA, f.familyA, t.id, { title: "Mit Details" }, app); // status omitted: unchanged
    expect(kept.status).toBe("DONE");
    await admin.task.delete({ where: { id: t.id } });
  });

  it("filters: meine, unzugewiesen, erledigt, archiv, person, period", async () => {
    const mine = await createTask(f.userA, f.familyA, { title: "F-meine", assigneeIds: [f.profileA], dueDate: "2026-12-01" }, app);
    const other = await createTask(f.userA, f.familyA, { title: "F-ben", assigneeIds: [second], dueDate: "2026-12-10" }, app);
    const none = await createTask(f.userA, f.familyA, { title: "F-niemand" }, app);
    const done = await createTask(f.userA, f.familyA, { title: "F-fertig", status: "DONE" }, app);
    const ids = async (q: Parameters<typeof findTasks>[2]) => (await findTasks(f.userA, f.familyA, q, app)).map((t) => t.title).filter((x) => x.startsWith("F-")).sort();
    expect(await ids({ filter: "meine" })).toEqual(["F-meine"]);
    expect(await ids({ filter: "unzugewiesen" })).toEqual(["F-niemand"]); // done tasks are not "open and unassigned"
    expect(await ids({ filter: "erledigt" })).toEqual(["F-fertig"]);
    expect(await ids({ filter: "offen" })).toEqual(["F-ben", "F-meine", "F-niemand"]);
    expect(await ids({ filter: "alle" })).toEqual(["F-ben", "F-fertig", "F-meine", "F-niemand"]);
    expect(await ids({ filter: "alle", profileId: second })).toEqual(["F-ben"]);
    expect(await ids({ filter: "alle", from: "2026-12-05", to: "2026-12-31" })).toEqual(["F-ben"]);
    // another user's "meine" is based on their own profile
    expect(await ids({ filter: "meine" })).not.toContain("F-ben");
    // archive: leaves lists and the dashboard, stays in "archiv", can come back
    await setTaskArchived(f.userA, f.familyA, mine.id, true, app);
    expect(await ids({ filter: "alle" })).not.toContain("F-meine");
    expect(await ids({ filter: "archiv" })).toEqual(["F-meine"]);
    expect(JSON.stringify(await getDashboard(f.userA, f.familyA, NOW, app))).not.toContain("F-meine");
    await setTaskArchived(f.userA, f.familyA, mine.id, false, app);
    expect(await ids({ filter: "archiv" })).toEqual([]);
    await expect(setTaskArchived(f.userA, f.familyA, f.taskB, true, app)).rejects.toBeInstanceOf(NotFoundError);
    await admin.task.deleteMany({ where: { id: { in: [mine.id, other.id, none.id, done.id] } } });
  });
});
