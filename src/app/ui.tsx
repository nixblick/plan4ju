import type { ReactNode } from "react";

export const inputCls =
  "w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-base focus:border-terracotta focus:outline-none focus:ring-2 focus:ring-terracotta/30";
export const buttonCls =
  "inline-flex min-h-11 items-center justify-center rounded-xl bg-terracotta px-4 py-2 font-medium text-white hover:bg-terracotta-dark";
export const ghostButtonCls =
  "inline-flex min-h-11 items-center justify-center rounded-xl border border-stone-300 bg-white px-4 py-2 font-medium hover:bg-stone-50";

export function Card({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200">
      {title ? <h2 className="mb-3 text-lg font-semibold">{title}</h2> : null}
      {children}
    </section>
  );
}

export function Notice({ kind, children }: { kind: "error" | "ok"; children: ReactNode }) {
  const cls = kind === "error" ? "bg-red-50 text-red-800 ring-red-200" : "bg-green-50 text-green-800 ring-green-200";
  return (
    <p role={kind === "error" ? "alert" : "status"} className={`mb-4 rounded-xl px-3 py-2 text-sm ring-1 ${cls}`}>
      {children}
    </p>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="mb-4 block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}
