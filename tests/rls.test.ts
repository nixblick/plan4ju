import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, app, cleanup, seed, type Fixture } from "./helpers";
import { ForbiddenError } from "../src/server/errors";
import { withFamily } from "../src/server/tenant";

let f: Fixture;
beforeAll(async () => {
  f = await seed();
});
afterAll(async () => {
  await cleanup(f);
  await app.$disconnect();
  await admin.$disconnect();
});

/** Raw transaction as the app role with an arbitrary (possibly hostile) context. */
function raw<T>(familyId: string | null, userId: string, fn: (tx: Parameters<Parameters<typeof app.$transaction>[0]>[0]) => Promise<T>) {
  return app.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.user_id', ${userId}, true)`;
    if (familyId) await tx.$executeRaw`SELECT set_config('app.family_id', ${familyId}, true)`;
    return fn(tx);
  });
}

describe("database role", () => {
  it("app role has no BYPASSRLS, is no superuser and owns no table", async () => {
    const r = await app.$queryRaw<{ rolbypassrls: boolean; rolsuper: boolean }[]>`
      SELECT rolbypassrls, rolsuper FROM pg_roles WHERE rolname = current_user`;
    expect(r[0]).toEqual({ rolbypassrls: false, rolsuper: false });
    const owned = await app.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n FROM pg_tables WHERE schemaname = 'public' AND tableowner = current_user`;
    expect(Number(owned[0]!.n)).toBe(0);
  });

  it("every family-scoped table has forced row level security", async () => {
    const rows = await admin.$queryRaw<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }[]>`
      SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class
      WHERE relname IN ('family','family_membership','family_profile','family_invitation','task','task_assignment','birthday')`;
    expect(rows).toHaveLength(7);
    for (const r of rows) expect([r.relname, r.relrowsecurity, r.relforcerowsecurity]).toEqual([r.relname, true, true]);
  });
});

describe("no context", () => {
  it("sees nothing and cannot insert without a family context", async () => {
    const tasks = await app.task.findMany();
    expect(tasks).toHaveLength(0);
    expect(await app.family.findMany()).toHaveLength(0);
    expect(await app.familyMembership.findMany()).toHaveLength(0);
    await expect(
      app.task.create({ data: { familyId: f.familyA, title: "x", createdById: f.userA } }),
    ).rejects.toThrow();
  });
});

describe("database level isolation (queries without any familyId filter)", () => {
  it("family A sees only its own rows in every table", async () => {
    await raw(f.familyA, f.userA, async (tx) => {
      expect((await tx.task.findMany()).map((t) => t.id)).toEqual([f.taskA]);
      expect((await tx.familyProfile.findMany()).map((p) => p.id)).toEqual([f.profileA]);
      expect(await tx.birthday.findMany()).toHaveLength(0);
      expect(await tx.taskAssignment.findMany()).toHaveLength(0);
      expect((await tx.family.findMany()).map((x) => x.id)).toEqual([f.familyA]);
    });
  });

  it("direct id access to a foreign row returns nothing", async () => {
    await raw(f.familyA, f.userA, async (tx) => {
      expect(await tx.task.findUnique({ where: { id: f.taskB } })).toBeNull();
      expect(await tx.birthday.findUnique({ where: { id: f.birthdayB } })).toBeNull();
      expect(await tx.familyProfile.findUnique({ where: { id: f.profileB } })).toBeNull();
    });
  });

  it("foreign rows cannot be updated or deleted by direct id", async () => {
    await raw(f.familyA, f.userA, async (tx) => {
      expect((await tx.task.updateMany({ where: { id: f.taskB }, data: { title: "gehackt" } })).count).toBe(0);
      expect((await tx.task.deleteMany({ where: { id: f.taskB } })).count).toBe(0);
      expect((await tx.birthday.deleteMany({ where: { id: f.birthdayB } })).count).toBe(0);
    });
    const still = await admin.task.findUniqueOrThrow({ where: { id: f.taskB } });
    expect(still.title).toBe("Geheime Aufgabe B");
  });

  it("cannot insert a row for another family, nor move a row into one", async () => {
    await expect(
      raw(f.familyA, f.userA, (tx) => tx.task.create({ data: { familyId: f.familyB, title: "x", createdById: f.userA } })),
    ).rejects.toThrow();
    await expect(
      raw(f.familyA, f.userA, (tx) => tx.task.update({ where: { id: f.taskA }, data: { familyId: f.familyB } })),
    ).rejects.toThrow();
    expect((await admin.task.findUniqueOrThrow({ where: { id: f.taskA } })).familyId).toBe(f.familyA);
  });

  it("assignments cannot cross families (foreign profile, foreign task)", async () => {
    await expect(
      raw(f.familyA, f.userA, (tx) =>
        tx.taskAssignment.create({ data: { taskId: f.taskA, profileId: f.profileB, familyId: f.familyA } }),
      ),
    ).rejects.toThrow();
    await expect(
      raw(f.familyA, f.userA, (tx) =>
        tx.taskAssignment.create({ data: { taskId: f.taskB, profileId: f.profileA, familyId: f.familyA } }),
      ),
    ).rejects.toThrow();
  });

  it("a user can list own memberships without a family, but not foreign ones", async () => {
    await raw(null, f.userBoth, async (tx) => {
      const m = await tx.familyMembership.findMany();
      expect(m.map((x) => x.familyId).sort()).toEqual([f.familyA, f.familyB].sort());
      expect((await tx.family.findMany()).map((x) => x.id).sort()).toEqual([f.familyA, f.familyB].sort());
      expect(await tx.task.findMany()).toHaveLength(0); // no active family: no family data
    });
    await raw(null, f.userA, async (tx) => {
      expect((await tx.familyMembership.findMany()).map((x) => x.familyId)).toEqual([f.familyA]);
    });
  });

  it("the app role cannot create or delete families", async () => {
    await expect(raw(f.familyA, f.userA, (tx) => tx.family.create({ data: { name: "neu" } }))).rejects.toThrow();
    await expect(raw(f.familyA, f.userA, (tx) => tx.family.delete({ where: { id: f.familyA } }))).rejects.toThrow();
  });
});

describe("context does not stick", () => {
  it("is gone after commit, also on reused pooled connections", async () => {
    const one = new (app.constructor as new (o: object) => typeof app)({
      datasourceUrl: process.env.DATABASE_URL + (process.env.DATABASE_URL!.includes("?") ? "&" : "?") + "connection_limit=1",
    });
    try {
      await withFamily(f.userA, f.familyA, async (ctx) => {
        expect(await ctx.tx.task.count()).toBe(1);
      }, one);
      // same single connection, outside of any context
      const s = await one.$queryRaw<{ f: string | null; u: string | null }[]>`
        SELECT NULLIF(current_setting('app.family_id', true), '') AS f, NULLIF(current_setting('app.user_id', true), '') AS u`;
      expect(s[0]).toEqual({ f: null, u: null });
      expect(await one.task.findMany()).toHaveLength(0);
      // next transaction of another family on the same connection sees only its own data
      await withFamily(f.userB, f.familyB, async (ctx) => {
        expect((await ctx.tx.task.findMany()).map((t) => t.id)).toEqual([f.taskB]);
      }, one);
    } finally {
      await one.$disconnect();
    }
  });

  it("is gone after a rollback", async () => {
    await expect(
      withFamily(f.userA, f.familyA, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(await app.task.findMany()).toHaveLength(0);
  });

  it("concurrent requests of different families do not mix", async () => {
    const run = (u: string, fam: string, expected: string) =>
      withFamily(u, fam, async (ctx) => {
        await new Promise((r) => setTimeout(r, Math.random() * 30));
        expect((await ctx.tx.task.findMany()).map((t) => t.id)).toEqual([expected]);
      });
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        i % 2 ? run(f.userA, f.familyA, f.taskA) : run(f.userB, f.familyB, f.taskB),
      ),
    );
  });
});

describe("withFamily membership check", () => {
  it("rejects a non-member and a foreign family id", async () => {
    await expect(withFamily(f.userA, f.familyB, async () => 1)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(withFamily(f.userNone, f.familyA, async () => 1)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(withFamily(f.userA, "does-not-exist", async () => 1)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("a user in two families sees only the active one", async () => {
    await withFamily(f.userBoth, f.familyA, async (ctx) => {
      expect((await ctx.tx.task.findMany()).map((t) => t.id)).toEqual([f.taskA]);
    });
    await withFamily(f.userBoth, f.familyB, async (ctx) => {
      expect((await ctx.tx.task.findMany()).map((t) => t.id)).toEqual([f.taskB]);
    });
  });
});
