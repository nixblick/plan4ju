import { Prisma, type PrismaClient } from "@prisma/client";
import { withFamily, withUser } from "../tenant";
import { ConflictError, ForbiddenError } from "../errors";

/** Version of the export layout; raise it when fields change. docs/datenschutz.md */
export const EXPORT_FORMAT = 1;

/**
 * Personal data export (GDPR art. 15/20). Runs with the restricted client, one family context per
 * membership, so row level security decides what is visible: reservations of the user's own
 * surprise wishes, other people's mindfulness entries and other people's feedback never appear.
 * Only rows the user wrote (createdById/userId) plus the own profile and own wishlists.
 */
export async function exportOwnData(userId: string, client?: PrismaClient) {
  const account = await withUser(
    userId,
    async (tx) => ({
      user: await tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: { id: true, name: true, email: true, emailVerified: true, createdAt: true, updatedAt: true },
      }),
      memberships: await tx.familyMembership.findMany({
        where: { userId },
        select: { familyId: true, role: true, createdAt: true, family: { select: { name: true } } },
        orderBy: { createdAt: "asc" },
      }),
    }),
    client,
  );

  const families = [];
  for (const m of account.memberships) {
    families.push(
      await withFamily(
        userId,
        m.familyId,
        async ({ tx }) => {
          const mine = { createdById: userId };
          const profile = await tx.familyProfile.findFirst({
            where: { userId },
            select: { id: true, displayName: true, isChild: true, createdAt: true },
          });
          return {
            family: { id: m.familyId, name: m.family.name, role: m.role, memberSince: m.createdAt },
            profile,
            tasks: await tx.task.findMany({ where: mine }),
            birthdays: await tx.birthday.findMany({ where: mine }),
            routines: await tx.routine.findMany({ where: mine }),
            calendarEvents: await tx.calendarEvent.findMany({ where: mine }),
            externalCalendars: await tx.externalCalendar.findMany({
              where: mine,
              select: { id: true, name: true, kind: true, createdAt: true },
            }),
            recipes: await tx.recipe.findMany({ where: mine, include: { ingredients: true } }),
            meals: await tx.meal.findMany({ where: mine }),
            shoppingItems: await tx.shoppingItem.findMany({ where: mine }),
            pointsOfInterest: await tx.poi.findMany({ where: mine }),
            // Own wish lists (about the own profile) with their wishes; reservations are left out.
            wishlists: profile
              ? await tx.wishlist.findMany({ where: { profileId: profile.id }, include: { wishes: true } })
              : [],
            wishesWritten: await tx.wish.findMany({ where: mine }),
            wishReservationsMade: await tx.wishReservation.findMany({
              where: { reservedById: userId },
              select: { wishId: true, given: true, createdAt: true },
            }),
            mindfulness: await tx.mindfulnessEntry.findMany({
              where: mine,
              select: {
                id: true, profileId: true, topic: true, date: true, rating: true, note: true, visibility: true,
                createdAt: true, updatedAt: true, _count: { select: { shares: true } },
              },
            }),
            feedback: await tx.feedback.findMany({
              where: { userId },
              // The screenshot is left out: it may show other people's data.
              select: { id: true, kind: true, message: true, authorName: true, pagePath: true, appVersion: true, device: true, createdAt: true, imageType: true },
            }),
            notifications: await tx.notification.findMany({
              where: { userId },
              select: { kind: true, title: true, link: true, createdAt: true, readAt: true },
            }),
            notificationPrefs: await tx.notificationPref.findMany({ where: { userId } }),
          };
        },
        client,
      ),
    );
  }

  return {
    format: EXPORT_FORMAT,
    exportedAt: new Date().toISOString(),
    account: account.user,
    families,
  };
}

/** Families in which the user is the only owner: these block deleting the account. */
export async function familiesBlockingAccountDelete(userId: string, client?: PrismaClient) {
  const memberships = await withUser(
    userId,
    (tx) => tx.familyMembership.findMany({ where: { userId, role: "OWNER" }, select: { familyId: true, family: { select: { name: true } } } }),
    client,
  );
  const blocking: { familyId: string; name: string; otherMembers: number }[] = [];
  for (const m of memberships) {
    const counts = await withFamily(
      userId,
      m.familyId,
      async ({ tx }) => ({
        owners: await tx.familyMembership.count({ where: { role: "OWNER" } }),
        members: await tx.familyMembership.count(),
      }),
      client,
    );
    if (counts.owners <= 1) blocking.push({ familyId: m.familyId, name: m.family.name, otherMembers: counts.members - 1 });
  }
  return blocking;
}

function isCheckViolation(e: unknown): boolean {
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    const meta = JSON.stringify(e.meta ?? {});
    return meta.includes("23514") || e.message.includes("at least one owner");
  }
  return e instanceof Error && e.message.includes("at least one owner");
}

/** Deletes the own account (password already verified by the caller). ConflictError while last owner. */
export async function deleteOwnAccount(userId: string, client?: PrismaClient) {
  try {
    await withUser(userId, (tx) => tx.$executeRaw`SELECT app_delete_own_account()`, client);
  } catch (e) {
    if (isCheckViolation(e)) throw new ConflictError("A family needs at least one owner");
    throw e;
  }
}

/** OWNER deletes the active family with everything in it. */
export async function deleteFamily(userId: string, familyId: string, client?: PrismaClient) {
  await withFamily(
    userId,
    familyId,
    async (ctx) => {
      if (ctx.role !== "OWNER") throw new ForbiddenError("Only an owner may delete the family");
      await ctx.tx.$executeRaw`SELECT app_delete_active_family()`;
    },
    client,
  );
}
