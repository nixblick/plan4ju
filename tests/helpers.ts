import { PrismaClient } from "@prisma/client";

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set (start docker compose, copy .env.example to .env)`);
  return v;
}

/** Restricted application role: RLS applies. */
export const app = new PrismaClient({ datasourceUrl: need("DATABASE_URL") });
/** Table owner: only for seeding and cleanup in tests. */
export const admin = new PrismaClient({ datasourceUrl: need("DATABASE_ADMIN_URL") });

export interface Fixture {
  familyA: string;
  familyB: string;
  userA: string; // member of A only
  userB: string; // member of B only
  userBoth: string; // member of A and B
  userNone: string; // member of nothing
  profileA: string;
  profileB: string;
  taskA: string;
  taskB: string;
  birthdayB: string;
}

export async function seed(): Promise<Fixture> {
  const s = Math.random().toString(36).slice(2, 10);
  const mkUser = (key: string) =>
    admin.user.create({ data: { id: `u-${key}-${s}`, name: `Muster ${key}`, email: `${key}-${s}@example.test` } });
  const [ua, ub, uboth, unone] = await Promise.all([mkUser("a"), mkUser("b"), mkUser("both"), mkUser("none")]);
  const fa = await admin.family.create({ data: { name: `Familie Muster A ${s}` } });
  const fb = await admin.family.create({ data: { name: `Familie Muster B ${s}` } });
  await admin.familyMembership.createMany({
    data: [
      { familyId: fa.id, userId: ua.id, role: "OWNER" },
      { familyId: fb.id, userId: ub.id, role: "OWNER" },
      { familyId: fa.id, userId: uboth.id },
      { familyId: fb.id, userId: uboth.id },
    ],
  });
  const pa = await admin.familyProfile.create({ data: { familyId: fa.id, displayName: "Anna Muster", userId: ua.id } });
  const pb = await admin.familyProfile.create({ data: { familyId: fb.id, displayName: "Bea Beispiel", userId: ub.id } });
  const ta = await admin.task.create({ data: { familyId: fa.id, title: "Müll rausbringen", createdById: ua.id } });
  const tb = await admin.task.create({
    data: {
      familyId: fb.id,
      title: "Geheime Aufgabe B",
      createdById: ub.id,
      assignments: { create: { profileId: pb.id, familyId: fb.id } },
    },
  });
  const bb = await admin.birthday.create({
    data: { familyId: fb.id, name: "Oma Beispiel", month: 3, day: 14, createdById: ub.id },
  });
  return {
    familyA: fa.id, familyB: fb.id, userA: ua.id, userB: ub.id, userBoth: uboth.id, userNone: unone.id,
    profileA: pa.id, profileB: pb.id, taskA: ta.id, taskB: tb.id, birthdayB: bb.id,
  };
}

export async function cleanup(f: Fixture): Promise<void> {
  await admin.family.deleteMany({ where: { id: { in: [f.familyA, f.familyB] } } });
  await admin.user.deleteMany({ where: { id: { in: [f.userA, f.userB, f.userBoth, f.userNone] } } });
}
