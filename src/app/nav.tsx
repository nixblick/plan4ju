"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const icon = (d: string) => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);

const ITEMS: { href: string; label: string; icon: ReactNode; match: (p: string) => boolean }[] = [
  { href: "/", label: "Heute", icon: icon("M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"), match: (p) => p === "/" },
  { href: "/aufgaben", label: "Aufgaben", icon: icon("M9 11l3 3 8-8M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9"), match: (p) => p.startsWith("/aufgaben") },
  { href: "/routinen", label: "Routinen", icon: icon("M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3"), match: (p) => p.startsWith("/routinen") },
  { href: "/geburtstage", label: "Geburtstage", icon: icon("M4 20h16v-6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2zM12 12V8M12 8c-1-1-1-2 0-3 1 1 1 2 0 3M4 16c2 2 4 2 8 0s6-2 8 0"), match: (p) => p.startsWith("/geburtstage") },
  { href: "/familie/mitglieder", label: "Familie", icon: icon("M16 20v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM21 20v-1a4 4 0 0 0-3-3.9M16 4.1a3.5 3.5 0 0 1 0 6.8"), match: (p) => p.startsWith("/familie") },
];

export function NavLinks({ variant }: { variant: "tabs" | "side" }) {
  const path = usePathname() ?? "/";
  return (
    <>
      {ITEMS.map((i) => {
        const active = i.match(path);
        const base = variant === "tabs"
          ? "flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 px-1 text-[11px] font-medium"
          : "flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium";
        const color = active
          ? variant === "tabs" ? "text-terracotta-dark" : "bg-orange-100 text-terracotta-dark"
          : variant === "tabs" ? "text-stone-600" : "text-stone-700 hover:bg-stone-100";
        return (
          <Link key={i.href} href={i.href} aria-current={active ? "page" : undefined} className={`${base} ${color}`}>
            {i.icon}
            <span>{i.label}</span>
          </Link>
        );
      })}
    </>
  );
}
