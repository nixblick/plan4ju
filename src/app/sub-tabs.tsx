import Link from "next/link";

/**
 * Tabs as plain links (?tab=…): reachable by URL, by keyboard (Tab, Enter) and with the back button.
 * Used by routines and tasks.
 */
export function SubTabs<K extends string>({ label, base, tabs, active, testId }: {
  label: string;
  base: string;
  tabs: readonly { key: K; label: string }[];
  active: K;
  testId?: string;
}) {
  return (
    <nav aria-label={label} className="flex gap-1 rounded-xl bg-stone-100 p-1 text-sm" data-testid={testId}>
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={`${base}?tab=${t.key}`}
          aria-current={t.key === active ? "page" : undefined}
          className={`flex min-h-11 flex-1 items-center justify-center rounded-lg px-2 text-center font-medium ${t.key === active ? "bg-white text-terracotta-dark shadow-sm" : "text-stone-700"}`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
