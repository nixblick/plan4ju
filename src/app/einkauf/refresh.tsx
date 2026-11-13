"use client";

import { useRouter } from "next/navigation";
import { useEffect, useTransition } from "react";

/** The shared list stays current: reload button plus a quiet refresh every 30 s while the tab is visible. */
export function RefreshButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible" && !document.querySelector("details[open] form, input:focus, textarea:focus")) router.refresh();
    }, 30_000);
    return () => clearInterval(t);
  }, [router]);
  return (
    <button type="button" onClick={() => start(() => router.refresh())} className="inline-flex min-h-11 items-center rounded-xl border border-stone-300 bg-white px-3 text-sm font-medium" aria-busy={pending}>
      {pending ? "Lädt …" : "Aktualisieren"}
    </button>
  );
}
