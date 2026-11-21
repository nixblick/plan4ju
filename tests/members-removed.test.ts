import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, app, cleanup, seed, type Fixture } from "./helpers";
import { NotFoundError } from "../src/server/errors";
import { getDashboard } from "../src/server/services/dashboard";
import { getCalendarView } from "../src/server/services/calendar-view";
import { addChildProfile, listProfiles, removeMember } from "../src/server/services/members";
import { createTask, getTask, updateTask } from "../src/server/services/tasks";
import { createRoutine, listOccurrences, setOccurrenceAssignees, updateRoutine } from "../src/server/services/routines";
import { createEvent, getEvent, updateEvent } from "../src/server/services/calendar";
import { copyMealWeek, createMeal, getMealWeek, updateMeal } from "../src/server/services/meals";
import { createWishlist, updateWishlist } from "../src/server/services/wishes";
import { addDays } from "../src/lib/week";

// A person removed from the family keeps the profile (history), but is no longer offered or assignable.
let f: Fixture;
let ben: string; // login member of family A, removed in beforeAll
let kid: string; // child profile without login: stays current
let oldTask: string;
let oldRoutine: string;
let oldEvent: string;
let oldMeal: string;
let oldList: string;
let fixedRoutine: string; // FIXED [ben, kid], created before Ben left
let rotatingRoutine: string; // ROTATING [ben, profileA], created before Ben left

// Monday 16.11.2026, 10:00 in Berlin.
const NOW = new Date("2026-11-16T09:00:00Z");
const TODAY = "2026-11-16";

beforeAll(async () => {
  f = await seed();
  ben = (await admin.familyProfile.create({ data: { familyId: f.familyA, displayName: "Ben Muster", userId: f.userBoth } })).id;
  kid = (await addChildProfile(f.userA, f.familyA, "Kim Muster", app)).id;
  // assignments made while Ben still belonged to the family
  oldTask = (await createTask(f.userA, f.familyA, { title: "Alte Aufgabe", assigneeIds: [ben] }, app)).id;
  oldRoutine = (await createRoutine(f.userA, f.familyA, { title: "Alte Routine", startDate: TODAY, endDate: addDays(TODAY, 3), assigneeIds: [ben] }, app, NOW)).id;
  oldEvent = (await createEvent(f.userA, f.familyA, { title: "Alter Termin", startDate: TODAY, startTime: "18:00", endTime: "19:00", participantIds: [ben] }, app)).id;
  const slot = (await getMealWeek(f.userA, f.familyA, TODAY, NOW, app)).slots[0]!;
  oldMeal = (await createMeal(f.userA, f.familyA, { date: TODAY, slotId: slot.id, text: "Suppe", cookIds: [ben] }, app)).id;
  oldList = (await createWishlist(f.userA, f.familyA, { title: "Bens Wünsche", profileId: ben }, app)).id;
  fixedRoutine = (await createRoutine(f.userA, f.familyA, { title: "Müll", startDate: TODAY, endDate: addDays(TODAY, 6), assigneeIds: [ben, kid] }, app, NOW)).id;
  rotatingRoutine = (await createRoutine(f.userA, f.familyA, { title: "Spülmaschine", startDate: TODAY, endDate: addDays(TODAY, 6), assignMode: "ROTATING", assigneeIds: [ben, f.profileA] }, app, NOW)).id;
  await removeMember(f.userA, f.familyA, f.userBoth, app, NOW);
});
afterAll(async () => {
  await cleanup(f);
  await app.$disconnect();
  await admin.$disconnect();
});

describe("removed member: loading", () => {
  it("profiles of dashboard, calendar and member list carry former; nothing is dropped, colours stay", async () => {
    const dash = await getDashboard(f.userA, f.familyA, NOW, app);
    const byId = new Map(dash.profiles.map((p) => [p.id, p]));
    expect(byId.get(ben)).toMatchObject({ name: "Ben Muster", former: true, userId: null });
    expect(byId.get(kid)?.former).toBe(false);
    expect(byId.get(f.profileA)?.former).toBe(false);
    // not filtered at the source: the colour index (creation order) of everyone after Ben stays the same
    expect(dash.profiles.map((p) => [p.id, p.colorIndex])).toEqual([[f.profileA, 0], [ben, 1], [kid, 2]]);

    const view = await getCalendarView(f.userA, f.familyA, TODAY, addDays(TODAY, 6), NOW, app);
    expect(view.profiles.find((p) => p.id === ben)?.former).toBe(true);

    const list = await listProfiles(f.userA, f.familyA, app);
    expect(list.find((p) => p.id === ben)).toMatchObject({ former: true, isChild: false, userId: null });
    expect(list.find((p) => p.id === kid)?.former).toBe(false);
  });

  it("old assignments still show the person", async () => {
    expect((await getTask(f.userA, f.familyA, oldTask, app)).assignments.map((a) => a.profileId)).toEqual([ben]);
    expect((await getEvent(f.userA, f.familyA, oldEvent, app)).participantIds).toEqual([ben]);
  });
});

describe("removed member: no new assignments", () => {
  it("tasks: creating or adding refuses the former member; children and members stay assignable", async () => {
    await expect(createTask(f.userA, f.familyA, { title: "Neu", assigneeIds: [ben] }, app)).rejects.toBeInstanceOf(NotFoundError);
    const t = await createTask(f.userA, f.familyA, { title: "Neu", assigneeIds: [f.profileA, kid] }, app);
    await expect(updateTask(f.userA, f.familyA, t.id, { title: "Neu", assigneeIds: [f.profileA, ben] }, app)).rejects.toBeInstanceOf(NotFoundError);
    // an edit of the old task keeps the old assignment
    const kept = await updateTask(f.userA, f.familyA, oldTask, { title: "Alte Aufgabe, geändert", assigneeIds: [ben] }, app);
    expect(kept.assignments.map((a) => a.profileId)).toEqual([ben]);
    // once removed from the task, the person cannot come back
    await updateTask(f.userA, f.familyA, oldTask, { title: "Alte Aufgabe", assigneeIds: [] }, app);
    await expect(updateTask(f.userA, f.familyA, oldTask, { title: "Alte Aufgabe", assigneeIds: [ben] }, app)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("routines: future occurrences go to the current people only, fixed and in rotation", async () => {
    const occ = await listOccurrences(f.userA, f.familyA, TODAY, addDays(TODAY, 6), app, NOW);
    const fixed = occ.filter((o) => o.routineId === fixedRoutine);
    const rotating = occ.filter((o) => o.routineId === rotatingRoutine);
    expect(fixed).toHaveLength(7);
    expect(rotating).toHaveLength(7);
    for (const o of fixed) expect(o.assigneeIds).toEqual([kid]);
    for (const o of rotating) expect(o.assigneeIds).toEqual([f.profileA]);
  });

  it("routines: creating, adding and assigning one occurrence refuse the former member", async () => {
    const base = { title: "Neue Routine", startDate: TODAY, endDate: addDays(TODAY, 2) };
    await expect(createRoutine(f.userA, f.familyA, { ...base, assigneeIds: [ben] }, app, NOW)).rejects.toBeInstanceOf(NotFoundError);
    const r = await createRoutine(f.userA, f.familyA, { ...base, assigneeIds: [kid] }, app, NOW);
    await expect(updateRoutine(f.userA, f.familyA, r.id, { ...base, assigneeIds: [kid, ben] }, app, NOW)).rejects.toBeInstanceOf(NotFoundError);
    // the old routine can still be edited with its assignment
    await updateRoutine(f.userA, f.familyA, oldRoutine, { title: "Alte Routine, geändert", startDate: TODAY, endDate: addDays(TODAY, 3), assigneeIds: [ben] }, app, NOW);
    const occ = (await listOccurrences(f.userA, f.familyA, TODAY, addDays(TODAY, 3), app, NOW)).filter((o) => o.routineId === r.id);
    expect(occ.length).toBeGreaterThan(0);
    await expect(setOccurrenceAssignees(f.userA, f.familyA, occ[0]!.id, [ben], app)).rejects.toBeInstanceOf(NotFoundError);
    await setOccurrenceAssignees(f.userA, f.familyA, occ[0]!.id, [f.profileA], app);
  });

  it("calendar, meals and wish lists refuse the former member as well", async () => {
    const ev = { title: "Neuer Termin", startDate: TODAY, startTime: "10:00", endTime: "11:00" };
    await expect(createEvent(f.userA, f.familyA, { ...ev, participantIds: [ben] }, app)).rejects.toBeInstanceOf(NotFoundError);
    await updateEvent(f.userA, f.familyA, oldEvent, { title: "Alter Termin", startDate: TODAY, startTime: "18:00", endTime: "19:30", participantIds: [ben] }, app);

    const slots = (await getMealWeek(f.userA, f.familyA, TODAY, NOW, app)).slots;
    await expect(createMeal(f.userA, f.familyA, { date: TODAY, slotId: slots[1]!.id, text: "Brot", cookIds: [ben] }, app)).rejects.toBeInstanceOf(NotFoundError);
    await updateMeal(f.userA, f.familyA, oldMeal, { date: TODAY, slotId: slots[0]!.id, text: "Suppe", cookIds: [ben] }, app);
    // a copied week is a new plan: the former member does not cook there
    expect(await copyMealWeek(f.userA, f.familyA, TODAY, null, app)).toBe(1);
    const next = await getMealWeek(f.userA, f.familyA, addDays(TODAY, 7), NOW, app);
    expect(next.meals.map((m) => m.cookIds)).toEqual([[]]);

    await expect(createWishlist(f.userA, f.familyA, { title: "Neu", profileId: ben }, app)).rejects.toBeInstanceOf(NotFoundError);
    await updateWishlist(f.userA, f.familyA, oldList, { title: "Bens alte Wünsche", profileId: ben }, app);
  });
});
