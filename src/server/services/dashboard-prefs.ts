import type { PrismaClient } from "@prisma/client";
import { DASHBOARD_KEYS, isDashboardElement, type DashboardElement } from "../../lib/dashboard-elements";
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

/**
 * Stores the choice for the elements the form offered (`offered`); `visible` are the ticked ones. Elements
 * not offered (their module is off right now) keep their earlier setting. Unknown keys are dropped.
 */
export function setVisibleElements(userId: string, familyId: string, offered: readonly string[], visible: readonly string[], client?: PrismaClient): Promise<void> {
  const off = new Set(offered.filter(isDashboardElement));
  const show = new Set(visible.filter(isDashboardElement));
  return withFamily(
    userId,
    familyId,
    async (ctx) => {
      const before = await ctx.tx.dashboardPref.findUnique({ where: { familyId_userId: { familyId: ctx.familyId, userId: ctx.userId } } });
      const kept = (before?.hidden ?? []).filter((k) => isDashboardElement(k) && !off.has(k));
      const hidden = DASHBOARD_KEYS.filter((k) => kept.includes(k) || (off.has(k) && !show.has(k)));
      await ctx.tx.dashboardPref.upsert({
        where: { familyId_userId: { familyId: ctx.familyId, userId: ctx.userId } },
        create: { familyId: ctx.familyId, userId: ctx.userId, hidden },
        update: { hidden },
      });
    },
    client,
  );
}
