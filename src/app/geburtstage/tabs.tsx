import Link from "next/link";

const TABS = [
  { key: "geburtstage", href: "/geburtstage", label: "Geburtstage" },
  { key: "wuensche", href: "/wuensche", label: "Wunschzettel" },
] as const;

/** Sub navigation of the "Geburtstage" area (the bottom bar has no room for another tab). */
export function FesteTabs({ active }: { active: (typeof TABS)[number]["key"] }) {
  return (
    <nav aria-label="Geburtstage und Wünsche" className="flex gap-1 rounded-xl bg-stone-100 p-1 text-sm">
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
