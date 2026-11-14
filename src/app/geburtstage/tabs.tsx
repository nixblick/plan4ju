import Link from "next/link";
import { activeModules } from "@/server/active-modules";
import type { ModuleKey } from "@/lib/modules";

const TABS = [
  { key: "geburtstage", href: "/geburtstage", label: "Geburtstage" },
  { key: "wuensche", href: "/wuensche", label: "Wunschzettel" },
  { key: "karte", href: "/karte", label: "Karte" },
] as const;

const MODULE_OF: Partial<Record<string, ModuleKey>> = { wuensche: "wishes", karte: "map" };

/** Sub navigation of the "Feste" tab: birthdays, wish lists and the map (the bottom bar keeps 7 tabs). */
export async function FesteTabs({ active }: { active: (typeof TABS)[number]["key"] }) {
  const modules = await activeModules();
  const tabs = TABS.filter((t) => {
    const m = MODULE_OF[t.key];
    return !m || modules[m];
  });
  if (tabs.length < 2) return null;
  return (
    <nav aria-label="Unterseiten" className="flex gap-1 rounded-xl bg-stone-100 p-1 text-sm">
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
