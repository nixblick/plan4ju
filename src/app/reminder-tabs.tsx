import Link from "next/link";
import { activeModules } from "@/server/active-modules";
import type { ModuleKey } from "@/lib/modules";

export const REMINDER_TABS = [
  { key: "wuensche", href: "/wuensche", label: "Wunschzettel", module: "wishes" },
  { key: "karte", href: "/karte", label: "POI", module: "map" },
  { key: "achtsamkeit", href: "/achtsamkeit", label: "Achtsamkeit", module: "mindfulness" },
] as const satisfies readonly { key: string; href: string; label: string; module: ModuleKey }[];

/** Sub navigation of "Reminder": wish lists, points of interest and mindfulness (each a switchable module). */
export async function ReminderTabs({ active }: { active: (typeof REMINDER_TABS)[number]["key"] }) {
  const modules = await activeModules();
  const tabs = REMINDER_TABS.filter((t) => modules[t.module]);
  if (tabs.length < 2) return null;
  return (
    <nav aria-label="Bereiche von Reminder" className="flex gap-1 rounded-xl bg-stone-100 p-1 text-sm">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={t.key === active ? "page" : undefined}
          className={`flex min-h-11 flex-1 items-center justify-center rounded-lg px-2 text-center font-medium ${t.key === active ? "bg-white text-terracotta-dark shadow-sm" : "text-stone-700"}`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
