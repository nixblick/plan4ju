// Task priorities: six levels, most urgent first, each with a pastel colour and a visible name
// (the colour is never the only signal). Pure, shared by the service, the forms and the list.

export const PRIORITIES = ["SOFORT", "DRINGEND", "ZEITNAH", "DEMNAECHST", "BEI_GELEGENHEIT", "IRGENDWANN"] as const;
export type Priority = (typeof PRIORITIES)[number];
export const DEFAULT_PRIORITY: Priority = "ZEITNAH";

export const PRIORITY_LABEL: Record<Priority, string> = {
  SOFORT: "Sofort",
  DRINGEND: "Dringend",
  ZEITNAH: "Zeitnah",
  DEMNAECHST: "Demnächst",
  BEI_GELEGENHEIT: "Bei Gelegenheit",
  IRGENDWANN: "Irgendwann",
};

/** Former three levels -> new six levels (same mapping as the migration). */
export const LEGACY_PRIORITY: Record<"HIGH" | "NORMAL" | "LOW", Priority> = {
  HIGH: "DRINGEND",
  NORMAL: "ZEITNAH",
  LOW: "BEI_GELEGENHEIT",
};

/** Accepts a new value or a former one, anything else falls back to the default. */
export function toPriority(v: string | null | undefined): Priority {
  if ((PRIORITIES as readonly string[]).includes(v ?? "")) return v as Priority;
  if (v && v in LEGACY_PRIORITY) return LEGACY_PRIORITY[v as keyof typeof LEGACY_PRIORITY];
  return DEFAULT_PRIORITY;
}

// Pastel: lila, rot, gelb, grün, blau, türkis. Literal class names (Tailwind only keeps what it can read).
// Text is dark on light background (contrast well above 4.5:1).
export const PRIORITY_BADGE: Record<Priority, string> = {
  SOFORT: "bg-violet-100 text-violet-900 ring-violet-300",
  DRINGEND: "bg-red-100 text-red-900 ring-red-300",
  ZEITNAH: "bg-yellow-100 text-yellow-900 ring-yellow-300",
  DEMNAECHST: "bg-green-100 text-green-900 ring-green-300",
  BEI_GELEGENHEIT: "bg-blue-100 text-blue-900 ring-blue-300",
  IRGENDWANN: "bg-teal-100 text-teal-900 ring-teal-300",
};
/** Left edge of a task row in the priority colour. */
export const PRIORITY_EDGE: Record<Priority, string> = {
  SOFORT: "border-l-violet-300",
  DRINGEND: "border-l-red-300",
  ZEITNAH: "border-l-yellow-300",
  DEMNAECHST: "border-l-green-300",
  BEI_GELEGENHEIT: "border-l-blue-300",
  IRGENDWANN: "border-l-teal-300",
};

export interface SortableTask {
  dueDate: Date | string | null;
  dueTime: string | null;
  priority: Priority;
  title: string;
}

const iso = (d: Date | string | null) => (d === null ? null : typeof d === "string" ? d.slice(0, 10) : d.toISOString().slice(0, 10));

/** By due date (time of day, then priority, then title); tasks without a date at the end. */
export function compareByDue(a: SortableTask, b: SortableTask): number {
  const da = iso(a.dueDate);
  const db = iso(b.dueDate);
  if (da !== db) {
    if (da === null) return 1;
    if (db === null) return -1;
    return da < db ? -1 : 1;
  }
  const ta = a.dueTime ?? "99:99";
  const tb = b.dueTime ?? "99:99";
  if (ta !== tb) return ta < tb ? -1 : 1;
  const pa = PRIORITIES.indexOf(a.priority);
  const pb = PRIORITIES.indexOf(b.priority);
  if (pa !== pb) return pa - pb;
  return a.title.localeCompare(b.title, "de");
}
