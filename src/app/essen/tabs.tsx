import Link from "next/link";

const TABS = [
  { key: "plan", href: "/essen", label: "Wochenplan" },
  { key: "rezepte", href: "/rezepte", label: "Rezepte" },
  { key: "idee", href: "/essen/idee", label: "Rezeptidee" },
] as const;

/** Sub navigation of the "Essen" area (the bottom bar has no room for more tabs). */
export function EssenTabs({ active }: { active: (typeof TABS)[number]["key"] }) {
  return (
    <nav aria-label="Essen" className="flex gap-1 rounded-xl bg-stone-100 p-1 text-sm">
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
