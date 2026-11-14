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
      WHERE relname IN ('family','family_membership','family_profile','family_invitation','task','task_assignment','birthday','routine','routine_assignment','routine_occurrence','routine_occurrence_assignment','feedback','calendar_event','calendar_event_participant','external_calendar','external_calendar_event','recipe','recipe_ingredient','meal_slot','meal','meal_cook','shop','shopping_item','shopping_item_shop','wishlist','wish','wish_reservation','map_category','poi','mindfulness_entry','mindfulness_share','notification','notification_pref','calendar_feed','calendar_event_exception','image')`;
    expect(rows).toHaveLength(36);
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

  it("routine tables: family A sees nothing of B, by list and by id", async () => {
    await raw(f.familyA, f.userA, async (tx) => {
      expect(await tx.routine.findMany()).toHaveLength(0);
      expect(await tx.routineAssignment.findMany()).toHaveLength(0);
      expect(await tx.routineOccurrence.findMany()).toHaveLength(0);
      expect(await tx.routineOccurrenceAssignment.findMany()).toHaveLength(0);
      expect(await tx.routine.findUnique({ where: { id: f.routineB } })).toBeNull();
      expect(await tx.routineOccurrence.findUnique({ where: { id: f.occurrenceB } })).toBeNull();
    });
    await raw(f.familyB, f.userB, async (tx) => {
      expect((await tx.routine.findMany()).map((r) => r.id)).toEqual([f.routineB]);
      expect((await tx.routineOccurrence.findMany()).map((r) => r.id)).toEqual([f.occurrenceB]);
    });
    expect(await app.routine.findMany()).toHaveLength(0); // no context at all
  });

  it("routine tables: foreign rows cannot be changed, inserted or moved", async () => {
    await raw(f.familyA, f.userA, async (tx) => {
      expect((await tx.routine.updateMany({ where: { id: f.routineB }, data: { title: "gehackt" } })).count).toBe(0);
      expect((await tx.routine.deleteMany({ where: { id: f.routineB } })).count).toBe(0);
      expect((await tx.routineOccurrence.updateMany({ where: { id: f.occurrenceB }, data: { status: "DONE" } })).count).toBe(0);
      expect((await tx.routineOccurrence.deleteMany({ where: { id: f.occurrenceB } })).count).toBe(0);
    });
    await expect(
      raw(f.familyA, f.userA, (tx) =>
        tx.routine.create({ data: { familyId: f.familyB, title: "x", startDate: new Date("2026-11-02"), createdById: f.userA } }),
      ),
    ).rejects.toThrow();
    await expect(
      raw(f.familyA, f.userA, (tx) =>
        tx.routineOccurrenceAssignment.create({ data: { occurrenceId: f.occurrenceB, profileId: f.profileA, familyId: f.familyB } }),
      ),
    ).rejects.toThrow();
    await expect(
      raw(f.familyA, f.userA, (tx) =>
        tx.routineOccurrence.create({ data: { familyId: f.familyB, routineId: f.routineB, date: new Date("2026-11-30") } }),
      ),
    ).rejects.toThrow();
    const r = await admin.routine.findUniqueOrThrow({ where: { id: f.routineB } });
    expect(r.title).toBe("Geheime Routine B");
    expect((await admin.routineOccurrence.findUniqueOrThrow({ where: { id: f.occurrenceB } })).status).toBe("OPEN");
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

describe("membership writes need OWNER or ADMIN", () => {
  it("a plain member cannot raise their own role or add users", async () => {
    await raw(f.familyA, f.userBoth, async (tx) => {
      const r = await tx.familyMembership.updateMany({
        where: { familyId: f.familyA, userId: f.userBoth },
        data: { role: "OWNER" },
      });
      expect(r.count).toBe(0);
    });
    await expect(
      raw(f.familyA, f.userBoth, (tx) =>
        tx.familyMembership.create({ data: { familyId: f.familyA, userId: f.userNone } }),
      ),
    ).rejects.toThrow();
    const m = await admin.familyMembership.findUnique({
      where: { familyId_userId: { familyId: f.familyA, userId: f.userBoth } },
    });
    expect(m?.role).toBe("MEMBER");
  });

  it("an owner can change roles in the active family only", async () => {
    await raw(f.familyA, f.userA, async (tx) => {
      const own = await tx.familyMembership.updateMany({
        where: { familyId: f.familyA, userId: f.userBoth }, data: { role: "ADMIN" },
      });
      expect(own.count).toBe(1);
      const foreign = await tx.familyMembership.updateMany({
        where: { familyId: f.familyB, userId: f.userBoth }, data: { role: "ADMIN" },
      });
      expect(foreign.count).toBe(0);
    });
    await admin.familyMembership.update({
      where: { familyId_userId: { familyId: f.familyA, userId: f.userBoth } }, data: { role: "MEMBER" },
    });
  });
});

describe("owner rows are written by owners only, the last owner stays", () => {
  const s = Math.random().toString(36).slice(2, 10);
  let fam: string;
  const u = { owner: `u-own-${s}`, admin: `u-adm-${s}`, member: `u-mem-${s}`, extra: `u-ext-${s}` };
  const row = (userId: string) => ({ familyId_userId: { familyId: fam, userId } });
  const roleOf = async (userId: string) => (await admin.familyMembership.findUnique({ where: row(userId) }))?.role ?? null;

  beforeAll(async () => {
    for (const [k, id] of Object.entries(u)) {
      await admin.user.create({ data: { id, name: `Muster ${k}`, email: `${k}-${s}@example.test` } });
    }
    fam = (await admin.family.create({ data: { name: `Familie Muster C ${s}` } })).id;
    await admin.familyMembership.createMany({
      data: [
        { familyId: fam, userId: u.owner, role: "OWNER" },
        { familyId: fam, userId: u.admin, role: "ADMIN" },
        { familyId: fam, userId: u.member, role: "MEMBER" },
      ],
    });
  });
  afterAll(async () => {
    await admin.family.deleteMany({ where: { id: fam } });
    await admin.user.deleteMany({ where: { id: { in: Object.values(u) } } });
  });

  it("an admin cannot create an owner (or an admin), only a member", async () => {
    await expect(raw(fam, u.admin, (tx) => tx.familyMembership.create({ data: { familyId: fam, userId: u.extra, role: "OWNER" } }))).rejects.toThrow();
    await expect(raw(fam, u.admin, (tx) => tx.familyMembership.create({ data: { familyId: fam, userId: u.extra, role: "ADMIN" } }))).rejects.toThrow();
    expect(await roleOf(u.extra)).toBeNull();
    await raw(fam, u.admin, (tx) => tx.familyMembership.create({ data: { familyId: fam, userId: u.extra, role: "MEMBER" } }));
    expect(await roleOf(u.extra)).toBe("MEMBER");
    await admin.familyMembership.delete({ where: row(u.extra) });
  });

  it("an admin cannot promote to owner, demote or delete an owner", async () => {
    await expect(
      raw(fam, u.admin, (tx) => tx.familyMembership.updateMany({ where: { familyId: fam, userId: u.member }, data: { role: "OWNER" } })),
    ).rejects.toThrow();
    await expect(
      raw(fam, u.admin, (tx) => tx.familyMembership.updateMany({ where: { familyId: fam, userId: u.admin }, data: { role: "OWNER" } })),
    ).resolves.toEqual({ count: 0 });
    await raw(fam, u.admin, async (tx) => {
      expect((await tx.familyMembership.updateMany({ where: { familyId: fam, userId: u.owner }, data: { role: "MEMBER" } })).count).toBe(0);
      expect((await tx.familyMembership.deleteMany({ where: { familyId: fam, userId: u.owner } })).count).toBe(0);
    });
    expect([await roleOf(u.owner), await roleOf(u.admin), await roleOf(u.member)]).toEqual(["OWNER", "ADMIN", "MEMBER"]);
  });

  it("an owner may create, promote, demote and delete owners", async () => {
    await raw(fam, u.owner, (tx) => tx.familyMembership.create({ data: { familyId: fam, userId: u.extra, role: "OWNER" } }));
    expect(await roleOf(u.extra)).toBe("OWNER");
    await raw(fam, u.owner, async (tx) => {
      expect((await tx.familyMembership.updateMany({ where: { familyId: fam, userId: u.member }, data: { role: "OWNER" } })).count).toBe(1);
      expect((await tx.familyMembership.updateMany({ where: { familyId: fam, userId: u.member }, data: { role: "MEMBER" } })).count).toBe(1);
      expect((await tx.familyMembership.updateMany({ where: { familyId: fam, userId: u.extra }, data: { role: "ADMIN" } })).count).toBe(1);
      expect((await tx.familyMembership.deleteMany({ where: { familyId: fam, userId: u.extra } })).count).toBe(1);
    });
    expect([await roleOf(u.member), await roleOf(u.extra)]).toEqual(["MEMBER", null]);
  });

  it("the last owner can be neither demoted nor removed, not even by the table owner", async () => {
    await expect(
      raw(fam, u.owner, (tx) => tx.familyMembership.updateMany({ where: { familyId: fam, userId: u.owner }, data: { role: "ADMIN" } })),
    ).rejects.toThrow(/at least one owner/);
    await expect(
      raw(fam, u.owner, (tx) => tx.familyMembership.deleteMany({ where: { familyId: fam, userId: u.owner } })),
    ).rejects.toThrow(/at least one owner/);
    await expect(admin.familyMembership.delete({ where: row(u.owner) })).rejects.toThrow(/at least one owner/);
    expect(await roleOf(u.owner)).toBe("OWNER");
    // With a second owner the first one may step down.
    await raw(fam, u.owner, async (tx) => {
      await tx.familyMembership.updateMany({ where: { familyId: fam, userId: u.admin }, data: { role: "OWNER" } });
      expect((await tx.familyMembership.updateMany({ where: { familyId: fam, userId: u.owner }, data: { role: "ADMIN" } })).count).toBe(1);
    });
    expect([await roleOf(u.owner), await roleOf(u.admin)]).toEqual(["ADMIN", "OWNER"]);
  });
});

describe("calendar tables", () => {
  it("family A sees nothing of B, by list and by id; B sees its own", async () => {
    await raw(f.familyA, f.userA, async (tx) => {
      expect(await tx.calendarEvent.findMany()).toHaveLength(0);
      expect(await tx.calendarEventParticipant.findMany()).toHaveLength(0);
      expect(await tx.externalCalendar.findMany()).toHaveLength(0);
      expect(await tx.externalCalendarEvent.findMany()).toHaveLength(0);
      expect(await tx.calendarEvent.findUnique({ where: { id: f.eventB } })).toBeNull();
      expect(await tx.externalCalendar.findUnique({ where: { id: f.calendarB } })).toBeNull();
      expect(await tx.externalCalendarEvent.findUnique({ where: { id: f.externalEventB } })).toBeNull();
    });
    await raw(f.familyB, f.userB, async (tx) => {
      expect((await tx.calendarEvent.findMany()).map((r) => r.id)).toEqual([f.eventB]);
      expect((await tx.externalCalendar.findMany()).map((r) => r.id)).toEqual([f.calendarB]);
      expect((await tx.externalCalendarEvent.findMany()).map((r) => r.id)).toEqual([f.externalEventB]);
    });
    expect(await app.calendarEvent.findMany()).toHaveLength(0); // no context at all
    expect(await app.externalCalendar.findMany()).toHaveLength(0);
  });

  it("foreign rows cannot be changed or deleted, and nothing can be inserted for another family", async () => {
    await raw(f.familyA, f.userA, async (tx) => {
      expect((await tx.calendarEvent.updateMany({ where: { id: f.eventB }, data: { title: "gehackt" } })).count).toBe(0);
      expect((await tx.calendarEvent.deleteMany({ where: { id: f.eventB } })).count).toBe(0);
      expect((await tx.externalCalendar.updateMany({ where: { id: f.calendarB }, data: { enabled: false } })).count).toBe(0);
      expect((await tx.externalCalendar.deleteMany({ where: { id: f.calendarB } })).count).toBe(0);
      expect((await tx.externalCalendarEvent.deleteMany({ where: { id: f.externalEventB } })).count).toBe(0);
    });
    const ev = { title: "x", startsAt: new Date("2026-11-20T10:00:00Z"), endsAt: new Date("2026-11-20T11:00:00Z"), createdById: f.userA };
    await expect(raw(f.familyA, f.userA, (tx) => tx.calendarEvent.create({ data: { familyId: f.familyB, ...ev } }))).rejects.toThrow();
    await expect(
      raw(f.familyA, f.userA, (tx) => tx.externalCalendar.create({ data: { familyId: f.familyB, name: "x", kind: "FILE", createdById: f.userA } })),
    ).rejects.toThrow();
    await expect(
      raw(f.familyA, f.userA, (tx) =>
        tx.externalCalendarEvent.create({ data: { familyId: f.familyB, calendarId: f.calendarB, uid: "u", instanceKey: "k", title: "x", startsAt: new Date(), endsAt: new Date() } }),
      ),
    ).rejects.toThrow();
    // an own row cannot be moved to B
    await expect(raw(f.familyB, f.userB, (tx) => tx.calendarEvent.update({ where: { id: f.eventB }, data: { familyId: f.familyA } }))).rejects.toThrow();
    expect(await admin.calendarEvent.count({ where: { id: f.eventB, familyId: f.familyB } })).toBe(1);
  });

  it("composite foreign keys: no event participant or calendar event across families", async () => {
    // A event, B profile (own family A context): refused by RLS or by the composite key
    const own = await admin.calendarEvent.create({
      data: { familyId: f.familyA, title: "A-Termin", startsAt: new Date("2026-11-20T10:00:00Z"), endsAt: new Date("2026-11-20T11:00:00Z"), createdById: f.userA },
    });
    await expect(admin.calendarEventParticipant.create({ data: { eventId: own.id, profileId: f.profileB, familyId: f.familyA } })).rejects.toThrow();
    await expect(admin.calendarEventParticipant.create({ data: { eventId: f.eventB, profileId: f.profileA, familyId: f.familyA } })).rejects.toThrow();
    await expect(
      admin.externalCalendarEvent.create({ data: { familyId: f.familyA, calendarId: f.calendarB, uid: "u", instanceKey: "k", title: "x", startsAt: new Date(), endsAt: new Date() } }),
    ).rejects.toThrow();
  });

  it("the time shape check refuses a timed event without instants and an all-day event without days", async () => {
    await expect(
      admin.calendarEvent.create({ data: { familyId: f.familyA, title: "x", createdById: f.userA } }),
    ).rejects.toThrow();
    await expect(
      admin.calendarEvent.create({ data: { familyId: f.familyA, title: "x", allDay: true, startDate: new Date("2026-11-20"), endDate: new Date("2026-11-19"), createdById: f.userA } }),
    ).rejects.toThrow();
  });
});

describe("wish reservations and the wishing person", () => {
  it("without surprise mode the wishing person sees no reservation row (no reservedById), only the taken flag via the function", async () => {
    const l = await admin.wishlist.create({ data: { familyId: f.familyA, profileId: f.profileA, title: "Offen RLS", surprise: false, createdById: f.userA } });
    const w = await admin.wish.create({ data: { familyId: f.familyA, listId: l.id, title: "Ball", createdById: f.userA } });
    const free = await admin.wish.create({ data: { familyId: f.familyA, listId: l.id, title: "Buch", createdById: f.userA } });
    await admin.wishReservation.create({ data: { familyId: f.familyA, wishId: w.id, reservedById: f.userBoth } });
    try {
      expect(await raw(f.familyA, f.userA, (tx) => tx.wishReservation.findMany({ where: { wishId: w.id } }))).toEqual([]);
      expect(await raw(f.familyA, f.userA, (tx) => tx.$queryRaw<{ c: bigint }[]>`SELECT count(*) AS c FROM "wish_reservation"`)).toEqual([{ c: 0n }]);
      const taken = await raw(f.familyA, f.userA, (tx) => tx.$queryRaw<{ id: string }[]>`SELECT app_wish_reserved_for_wisher(${[w.id, free.id]}::text[]) AS id`);
      expect(taken).toEqual([{ id: w.id }]);
      // givers still see the row; the function tells them nothing, they are not the wishing person
      expect(await raw(f.familyA, f.userBoth, (tx) => tx.wishReservation.findMany({ where: { wishId: w.id } }))).toHaveLength(1);
      expect(await raw(f.familyA, f.userBoth, (tx) => tx.$queryRaw`SELECT app_wish_reserved_for_wisher(${[w.id]}::text[]) AS id`)).toEqual([]);
      // the other family learns nothing
      expect(await raw(f.familyB, f.userB, (tx) => tx.$queryRaw`SELECT app_wish_reserved_for_wisher(${[w.id]}::text[]) AS id`)).toEqual([]);
      // in surprise mode the function is silent for the wishing person too
      await admin.wishlist.update({ where: { id: l.id }, data: { surprise: true } });
      expect(await raw(f.familyA, f.userA, (tx) => tx.$queryRaw`SELECT app_wish_reserved_for_wisher(${[w.id]}::text[]) AS id`)).toEqual([]);
    } finally {
      await admin.wishlist.delete({ where: { id: l.id } });
    }
  });
});
