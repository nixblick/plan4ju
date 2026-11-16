import type { PrismaClient } from "@prisma/client";
import { DASHBOARD_KEYS, isDashboardElement, moveElement, orderElements, type DashboardElement } from "../../lib/dashboard-elements";
import { withFamily } from "../tenant";

// Per user and family: which start page elements are hidden (RLS: strictly the own row, table dashboard_pref).

/** Hidden elements of the signed-in user in the active family (none stored: nothing hidden). */
export function getHiddenElements(userId: string, familyId: string, client?: PrismaClient): Promise<DashboardElement[]> {
  return withFamily(
    userId,
    familyId,
    async (ctx) => {
      const p = await ctx.tx.dashboardPref.findUnique({ where: { familyId_userId: { familyId: ctx.familyId, userId: ctx.userId } } });
      return (p?.hidden ?? []).filter(isDashboardElement);
    },
    client,
  );
}

/** Hidden elements and the full display order of the signed-in user (Release 0.9). */
export function getDashboardLayout(userId: string, familyId: string, client?: PrismaClient): Promise<{ hidden: DashboardElement[]; order: DashboardElement[] }> {
  return withFamily(
    userId,
    familyId,
    async (ctx) => {
      const p = await ctx.tx.dashboardPref.findUnique({ where: { familyId_userId: { familyId: ctx.familyId, userId: ctx.userId } } });
      return { hidden: (p?.hidden ?? []).filter(isDashboardElement), order: orderElements(p?.order ?? []) };
    },
    client,
  );
}

/**
 * Stores the choice for the elements the form offered (`offered`); `visible` are the ticked ones. Elements
 * not offered (their module is off right now) keep their earlier setting. Unknown keys are dropped.
 */
export function setVisibleElements(
  userId: string,
  familyId: string,
  offered: readonly string[],
  visible: readonly string[],
  client?: PrismaClient,
  move?: { key: string; dir: -1 | 1 },
): Promise<void> {
  const off = new Set(offered.filter(isDashboardElement));
  const show = new Set(visible.filter(isDashboardElement));
  return withFamily(
    userId,
    familyId,
    async (ctx) => {
      const before = await ctx.tx.dashboardPref.findUnique({ where: { familyId_userId: { familyId: ctx.familyId, userId: ctx.userId } } });
      const kept = (before?.hidden ?? []).filter((k) => isDashboardElement(k) && !off.has(k));
      const hidden = DASHBOARD_KEYS.filter((k) => kept.includes(k) || (off.has(k) && !show.has(k)));
      const before0 = orderElements(before?.order ?? []);
      const order = move ? moveElement(before0, [...off], move.key, move.dir) : before?.order ?? [];
      await ctx.tx.dashboardPref.upsert({
        where: { familyId_userId: { familyId: ctx.familyId, userId: ctx.userId } },
        create: { familyId: ctx.familyId, userId: ctx.userId, hidden, order },
        update: { hidden, order },
      });
    },
    client,
  );
}
