import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, app, cleanup, seed, type Fixture } from "./helpers";
import { NotFoundError } from "../src/server/errors";
import { acceptAssignment, createTask, declineAssignment, findTasks, getTask, updateTask } from "../src/server/services/tasks";
import { listNotifications, syncAndCount } from "../src/server/services/notifications";

// Family A: userA (Anna) assigns to userBoth (Bodo). Child profile without login: Kim.
let f: Fixture;
let pBoth = "";
let pKid = "";
const NOW = new Date("2026-11-16T08:00:00Z");

beforeAll(async () => {
  f = await seed();
  pBoth = (await admin.familyProfile.create({ data: { familyId: f.familyA, displayName: "Bodo Muster", userId: f.userBoth } })).id;
  pKid = (await admin.familyProfile.create({ data: { familyId: f.familyA, displayName: "Kim Muster", isChild: true } })).id;
});
afterAll(async () => {
  await cleanup(f);
  await app.$disconnect();
  await admin.$disconnect();
});

const state = (t: { assignments: { profileId: string; state: string }[] }) =>
  Object.fromEntries(t.assignments.map((a) => [a.profileId, a.state]));

describe("assignment states", () => {
  it("someone else is PENDING; self and child profiles are accepted right away", async () => {
    const t = await createTask(f.userA, f.familyA, { title: "Einkaufen", assigneeIds: [f.profileA, pBoth, pKid] }, app);
    expect(state(t)).toEqual({ [f.profileA]: "ACCEPTED", [pBoth]: "PENDING", [pKid]: "ACCEPTED" });
  });

  it("an edit keeps existing states and only asks newly added people", async () => {
    const t = await createTask(f.userA, f.familyA, { title: "Kochen", assigneeIds: [pBoth] }, app);
    await acceptAssignment(f.userBoth, f.familyA, t.id, app);
    const u = await updateTask(f.userA, f.familyA, t.id, { title: "Kochen am Abend", assigneeIds: [pBoth, f.profileA] }, app);
    expect(state(u)).toEqual({ [pBoth]: "ACCEPTED", [f.profileA]: "ACCEPTED" });
    const v = await updateTask(f.userA, f.familyA, t.id, { title: "Kochen am Abend", assigneeIds: [f.profileA] }, app);
    expect(state(v)).toEqual({ [f.profileA]: "ACCEPTED" });
  });

  it("accept: only the assigned person; the bell shows the new assignment until then", async () => {
    const t = await createTask(f.userA, f.familyA, { title: "Rasen mähen", assigneeIds: [pBoth] }, app);
    await syncAndCount(f.userBoth, f.familyA, NOW, app);
    expect((await listNotifications(f.userBoth, f.familyA, app)).map((n) => n.title)).toContain("Neu für dich: Rasen mähen");
    await expect(acceptAssignment(f.userA, f.familyA, t.id, app)).rejects.toBeInstanceOf(NotFoundError);
    await expect(acceptAssignment(f.userB, f.familyB, t.id, app)).rejects.toBeInstanceOf(NotFoundError);
    await acceptAssignment(f.userBoth, f.familyA, t.id, app);
    expect(state(await getTask(f.userA, f.familyA, t.id, app))).toEqual({ [pBoth]: "ACCEPTED" });
    await expect(acceptAssignment(f.userBoth, f.familyA, t.id, app)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("decline: the task is unassigned again and the assigner gets a notification", async () => {
    const t = await createTask(f.userA, f.familyA, { title: "Keller aufräumen", assigneeIds: [pBoth] }, app);
    await syncAndCount(f.userBoth, f.familyA, NOW, app);
    await expect(declineAssignment(f.userA, f.familyA, t.id, app)).rejects.toBeInstanceOf(NotFoundError);
    await declineAssignment(f.userBoth, f.familyA, t.id, app);
    expect((await getTask(f.userA, f.familyA, t.id, app)).assignments).toEqual([]);
    const unassigned = await findTasks(f.userA, f.familyA, { filter: "unzugewiesen" }, app);
    expect(unassigned.map((x) => x.id)).toContain(t.id);
    await syncAndCount(f.userA, f.familyA, NOW, app);
    expect((await listNotifications(f.userA, f.familyA, app)).map((n) => n.title)).toContain("Muster both hat abgelehnt: Keller aufräumen");
    // the decliner gets no such notification, an accepted assignment cannot be declined
    expect((await listNotifications(f.userBoth, f.familyA, app)).map((n) => n.title)).not.toContain("Muster both hat abgelehnt: Keller aufräumen");
    // assigning again after a decline notifies again
    await updateTask(f.userA, f.familyA, t.id, { title: "Keller aufräumen", assigneeIds: [pBoth] }, app);
    await syncAndCount(f.userBoth, f.familyA, new Date(NOW.getTime() + 60_000), app);
    const again = (await listNotifications(f.userBoth, f.familyA, app)).filter((n) => n.title === "Neu für dich: Keller aufräumen");
    expect(again).toHaveLength(2);
  });

  it("declining with other assignees leaves them assigned", async () => {
    const t = await createTask(f.userA, f.familyA, { title: "Fahrrad putzen", assigneeIds: [pBoth, f.profileA] }, app);
    await declineAssignment(f.userBoth, f.familyA, t.id, app);
    expect(state(await getTask(f.userA, f.familyA, t.id, app))).toEqual({ [f.profileA]: "ACCEPTED" });
  });
});
