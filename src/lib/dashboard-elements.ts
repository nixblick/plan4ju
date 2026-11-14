import type { ModuleKey } from "./modules";

/**
 * Elements of the start page ("Heute") that each user can show or hide (Release 0.8). An element of a
 * switchable module only appears while the family has the module on; the user setting can hide more, never
 * show what the family switched off. Stored as a list of hidden keys, so new elements start visible.
 */
export const DASHBOARD_ELEMENTS = {
  next: { label: "Als Nächstes" },
  today: { label: "Heute im Überblick" },
  week: { label: "Diese Woche" },
  meals: { label: "Essen heute", module: "meals" },
  waste: { label: "FES (Abfuhr)", module: "waste" },
  school: { label: "Schule heute", module: "school" },
  stars: { label: "Sterne", module: "stars" },
  events: { label: "Termine heute" },
  routines: { label: "Routinen heute" },
  tasks: { label: "Aufgaben (Meine, Heute fällig, Überfällig)" },
  birthdays: { label: "Geburtstage" },
  mindfulness: { label: "Achtsamkeit", module: "mindfulness" },
} as const satisfies Record<string, { label: string; module?: ModuleKey }>;

export type DashboardElement = keyof typeof DASHBOARD_ELEMENTS;
export const DASHBOARD_KEYS = Object.keys(DASHBOARD_ELEMENTS) as DashboardElement[];
export const isDashboardElement = (k: unknown): k is DashboardElement => typeof k === "string" && (DASHBOARD_KEYS as string[]).includes(k);

/** The module an element needs, if any. */
export function elementModule(k: DashboardElement): ModuleKey | null {
  const e = DASHBOARD_ELEMENTS[k] as { label: string; module?: ModuleKey };
  return e.module ?? null;
}

/** Elements the family allows (module on), in display order. */
export function allowedElements(modules: Record<ModuleKey, boolean>): DashboardElement[] {
  return DASHBOARD_KEYS.filter((k) => {
    const m = elementModule(k);
    return !m || modules[m];
  });
}

/** What the start page shows: allowed by the family and not hidden by the user. Unknown stored keys are ignored. */
export function visibleElements(modules: Record<ModuleKey, boolean>, hidden: readonly string[]): Set<DashboardElement> {
  const h = new Set(hidden);
  return new Set(allowedElements(modules).filter((k) => !h.has(k)));
}
