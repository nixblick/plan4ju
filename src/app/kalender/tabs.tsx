import Link from "next/link";

const TABS = [
  { key: "kalender", href: "/kalender", label: "Kalender" },
  { key: "geburtstage", href: "/kalender/geburtstage", label: "Geburtstage" },
  { key: "quellen", href: "/kalender/quellen", label: "Quellen" },
] as const;

/** Tabs of the calendar: 1. calendar and own events, 2. birthdays, 3. external sources and the waste calendar. */
export function KalenderTabs({ active }: { active: (typeof TABS)[number]["key"] }) {
  return (
    <nav aria-label="Bereiche des Kalenders" className="flex gap-1 rounded-xl bg-stone-100 p-1 text-sm" data-testid="kalender-tabs">
      {TABS.map((t) => (
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
