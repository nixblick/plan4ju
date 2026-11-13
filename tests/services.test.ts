import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, app, cleanup, seed, type Fixture } from "./helpers";
import { ForbiddenError, NotFoundError } from "../src/server/errors";
import { createTask, deleteTask, getTask, listTasks, setTaskDone, updateTask } from "../src/server/services/tasks";
import { createBirthday, deleteBirthday, listBirthdays, updateBirthday } from "../src/server/services/birthdays";
import { todayIn } from "../src/lib/week";
import { getDashboard } from "../src/server/services/dashboard";
import { listFamiliesForUser } from "../src/server/services/families";

let f: Fixture;
beforeAll(async () => {
  f = await seed();
});
afterAll(async () => {
  await cleanup(f);
  await app.$disconnect();
  await admin.$disconnect();
});

describe("tasks service", () => {
  it("lists only own family tasks", async () => {
    expect((await listTasks(f.userA, f.familyA, app)).map((t) => t.id)).toEqual([f.taskA]);
    expect((await listTasks(f.userB, f.familyB, app)).map((t) => t.id)).toEqual([f.taskB]);
  });

  it("refuses to act in a family the user does not belong to", async () => {
    await expect(listTasks(f.userA, f.familyB, app)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(createTask(f.userA, f.familyB, { title: "x" }, app)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("direct id of a foreign task: read, update, done, delete all give NotFound", async () => {
    await expect(getTask(f.userA, f.familyA, f.taskB, app)).rejects.toBeInstanceOf(NotFoundError);
    await expect(updateTask(f.userA, f.familyA, f.taskB, { title: "x" }, app)).rejects.toBeInstanceOf(NotFoundError);
    await expect(setTaskDone(f.userA, f.familyA, f.taskB, true, app)).rejects.toBeInstanceOf(NotFoundError);
    await expect(deleteTask(f.userA, f.familyA, f.taskB, app)).rejects.toBeInstanceOf(NotFoundError);
    const t = await admin.task.findUniqueOrThrow({ where: { id: f.taskB } });
    expect(t.title).toBe("Geheime Aufgabe B");
    expect(t.status).toBe("OPEN");
  });

  it("cannot assign a foreign profile", async () => {
    await expect(
      createTask(f.userA, f.familyA, { title: "x", assigneeIds: [f.profileB] }, app),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("create, assign, update, complete, delete in own family", async () => {
    const t = await createTask(f.userA, f.familyA, { title: "  Einkaufen ", assigneeIds: [f.profileA], dueDate: "2026-11-20" }, app);
    expect(t.title).toBe("Einkaufen");
    expect(t.assignments.map((a) => a.profileId)).toEqual([f.profileA]);
    const u = await updateTask(f.userA, f.familyA, t.id, { title: "Einkaufen bei Rewe", assigneeIds: [] }, app);
    expect(u.title).toBe("Einkaufen bei Rewe");
    expect(u.assignments).toHaveLength(0);
    await setTaskDone(f.userA, f.familyA, t.id, true, app);
    expect((await getTask(f.userA, f.familyA, t.id, app)).status).toBe("DONE");
    await deleteTask(f.userA, f.familyA, t.id, app);
    await expect(getTask(f.userA, f.familyA, t.id, app)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("validates input", async () => {
    await expect(createTask(f.userA, f.familyA, { title: "   " }, app)).rejects.toThrow();
  });
});

describe("birthdays service", () => {
  it("is isolated per family and works in own family", async () => {
    expect(await listBirthdays(f.userA, f.familyA, app)).toHaveLength(0);
    expect((await listBirthdays(f.userB, f.familyB, app)).map((b) => b.id)).toEqual([f.birthdayB]);
    await expect(updateBirthday(f.userA, f.familyA, f.birthdayB, { name: "x", month: 1, day: 1 }, app)).rejects.toBeInstanceOf(NotFoundError);
    await expect(deleteBirthday(f.userA, f.familyA, f.birthdayB, app)).rejects.toBeInstanceOf(NotFoundError);
    const b = await createBirthday(f.userA, f.familyA, { name: "Opa Muster", month: 12, day: 24 }, app);
    expect(b.birthYear).toBeNull();
    await deleteBirthday(f.userA, f.familyA, b.id, app);
  });

  it("rejects invalid dates input", async () => {
    await expect(createBirthday(f.userA, f.familyA, { name: "x", month: 13, day: 1 }, app)).rejects.toThrow();
  });
});

describe("families service", () => {
  it("lists only the user's own families", async () => {
    expect((await listFamiliesForUser(f.userA, app)).map((m) => m.family.id)).toEqual([f.familyA]);
    expect((await listFamiliesForUser(f.userBoth, app)).map((m) => m.family.id).sort()).toEqual([f.familyA, f.familyB].sort());
    expect(await listFamiliesForUser(f.userNone, app)).toHaveLength(0);
  });
});

describe("dashboard service", () => {
  it("shows only the own family's data", async () => {
    const today = todayIn("Europe/Berlin");
    await createTask(f.userA, f.familyA, { title: "Heute fällige Aufgabe A", dueDate: new Date(today) }, app);
    const a = JSON.stringify(await getDashboard(f.userA, f.familyA, new Date(), app));
    expect(a).toContain("Heute fällige Aufgabe A");
    expect(a).not.toContain("Geheime Aufgabe B");
    expect(a).not.toContain("Oma Beispiel");
    const b = JSON.stringify(await getDashboard(f.userB, f.familyB, new Date(), app));
    expect(b).toContain("Oma Beispiel");
    expect(b).not.toContain("Heute fällige Aufgabe A");
    await expect(getDashboard(f.userA, f.familyB, new Date(), app)).rejects.toThrow(ForbiddenError);
  });
});
