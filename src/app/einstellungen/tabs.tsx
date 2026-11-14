import Link from "next/link";

const TABS = [
  { key: "mitglieder", href: "/einstellungen/mitglieder", label: "Mitglieder" },
  { key: "module", href: "/einstellungen/module", label: "Module" },
  { key: "feedback", href: "/einstellungen/feedback", label: "Feedback" },
] as const;

/** Sub navigation of "Einstellungen" (members, modules and the own dashboard, feedback). */
export function EinstellungenTabs({ active }: { active: (typeof TABS)[number]["key"] }) {
  return (
    <nav aria-label="Bereiche der Einstellungen" className="flex gap-1 rounded-xl bg-stone-100 p-1 text-sm">
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
