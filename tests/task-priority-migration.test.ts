import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, app, cleanup, seed, type Fixture } from "./helpers";
import { createTask, findTasks, updateTask } from "../src/server/services/tasks";
import { getDashboard } from "../src/server/services/dashboard";

const MIGRATION = "prisma/migrations/20261120000000_task_priority_dashboard/migration.sql";

describe("migration task_priority_dashboard", () => {
  const schema = `mig_${Math.random().toString(36).slice(2, 10)}`;
  afterAll(async () => {
    await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  });

  it("maps HIGH/NORMAL/LOW, sets the new default and showOnDashboard = false", async () => {
    const statements = readFileSync(MIGRATION, "utf8")
      .split("\n").filter((l) => !l.startsWith("--")).join("\n")
      .split(";").map((s) => s.trim()).filter(Boolean);
    // Old state in a scratch schema, then the real migration file on top, in one transaction.
    const rows = await admin.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
      await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}"`);
      await tx.$executeRawUnsafe(`CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH')`);
      await tx.$executeRawUnsafe(`CREATE TABLE "task" (id text PRIMARY KEY, "priority" "TaskPriority" NOT NULL DEFAULT 'NORMAL')`);
      await tx.$executeRawUnsafe(`INSERT INTO "task" (id, "priority") VALUES ('h', 'HIGH'), ('n', 'NORMAL'), ('l', 'LOW')`);
      for (const s of statements) await tx.$executeRawUnsafe(s);
      await tx.$executeRawUnsafe(`INSERT INTO "task" (id) VALUES ('new')`);
      return tx.$queryRawUnsafe<{ id: string; priority: string; show: boolean }[]>(
        `SELECT id, "priority"::text AS priority, "showOnDashboard" AS show FROM "task" ORDER BY id`,
      );
    });
    expect(rows).toEqual([
      { id: "h", priority: "DRINGEND", show: false },
      { id: "l", priority: "BEI_GELEGENHEIT", show: false },
      { id: "n", priority: "ZEITNAH", show: false },
      { id: "new", priority: "ZEITNAH", show: false },
    ]);
  });
});

describe("dashboard switch", () => {
  let f: Fixture;
  beforeAll(async () => {
    f = await seed();
  });
  afterAll(async () => {
    await cleanup(f);
  });
  // Friday 13.11.2026 in Berlin.
  const NOW = new Date("2026-11-13T09:00:00Z");

  it("new tasks default to Zeitnah and off; only switched-on tasks reach the week, the tiles keep all", async () => {
    const off = await createTask(f.userA, f.familyA, { title: "Nicht im Kalender", dueDate: "2026-11-13" }, app);
    const on = await createTask(f.userA, f.familyA, { title: "Im Kalender", dueDate: "2026-11-13", showOnDashboard: true, priority: "SOFORT" }, app);
    expect([off.priority, off.showOnDashboard, on.showOnDashboard]).toEqual(["ZEITNAH", false, true]);

    let d = await getDashboard(f.userA, f.familyA, NOW, app);
    const today = () => d.week.find((x) => x.isToday)!.tasks.map((t) => t.title);
    expect(today()).toEqual(["Im Kalender"]);
    expect(d.dueToday.map((t) => t.title).sort()).toEqual(["Im Kalender", "Nicht im Kalender"]);

    await updateTask(f.userA, f.familyA, off.id, { title: "Nicht im Kalender", dueDate: "2026-11-13", showOnDashboard: true }, app);
    await updateTask(f.userA, f.familyA, on.id, { title: "Im Kalender", dueDate: "2026-11-13" }, app);
    d = await getDashboard(f.userA, f.familyA, NOW, app);
    expect(today()).toEqual(["Nicht im Kalender"]);
  });

  it("the task list sorts by due date (no date last), independent of status", async () => {
    await createTask(f.userA, f.familyA, { title: "Z ohne Datum", priority: "SOFORT" }, app);
    await createTask(f.userA, f.familyA, { title: "Z später", dueDate: "2026-12-01", status: "IN_PROGRESS" }, app);
    await createTask(f.userA, f.familyA, { title: "Z früher", dueDate: "2026-11-20", priority: "IRGENDWANN" }, app);
    const titles = (await findTasks(f.userA, f.familyA, { filter: "offen" }, app)).map((t) => t.title).filter((t) => t.startsWith("Z "));
    expect(titles).toEqual(["Z früher", "Z später", "Z ohne Datum"]);
  });
});
