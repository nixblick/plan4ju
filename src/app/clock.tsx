"use client";

import { useEffect, useState } from "react";

function greeting(hour: number): { hello: string; hint: string } {
  if (hour < 5) return { hello: "Gute Nacht", hint: "Ruhige Nacht" };
  if (hour < 11) return { hello: "Guten Morgen", hint: "Morgens · gleich geht's los" };
  if (hour < 14) return { hello: "Guten Tag", hint: "Mittags · Zeit für eine Pause" };
  if (hour < 18) return { hello: "Guten Tag", hint: "Nachmittags · noch einiges zu tun" };
  if (hour < 22) return { hello: "Guten Abend", hint: "Abends · der Tag klingt aus" };
  return { hello: "Gute Nacht", hint: "Spät · Zeit für das Bett" };
}

/** Time, date and greeting in the family's time zone. Re-renders every 20 seconds. */
export function DashboardHeader({ timeZone, familyName, initial }: { timeZone: string; familyName: string; initial: number }) {
  const [now, setNow] = useState(initial);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 20_000);
    return () => clearInterval(t);
  }, []);
  const d = new Date(now);
  const safe = (tz: string) => {
    try {
      new Intl.DateTimeFormat("de-DE", { timeZone: tz });
      return tz;
    } catch {
      return "Europe/Berlin";
    }
  };
  const tz = safe(timeZone);
  const time = new Intl.DateTimeFormat("de-DE", { timeZone: tz, hour: "2-digit", minute: "2-digit" }).format(d);
  const date = new Intl.DateTimeFormat("de-DE", { timeZone: tz, weekday: "long", day: "numeric", month: "long" }).format(d);
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", hourCycle: "h23" }).format(d));
  const g = greeting(hour);
  return (
    <header className="flex flex-wrap items-end gap-x-8 gap-y-2" suppressHydrationWarning>
      <div>
        <p className="text-5xl font-bold tracking-tight sm:text-6xl" data-testid="clock" suppressHydrationWarning>
          {time}
        </p>
        <p className="mt-1 text-base text-stone-600 sm:text-lg" suppressHydrationWarning>
          {date}
        </p>
      </div>
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl" suppressHydrationWarning>
          {g.hello}, {familyName}
        </h1>
        <p className="mt-1 inline-block rounded-full bg-orange-100 px-3 py-1 text-sm text-terracotta-dark" suppressHydrationWarning>
          {g.hint}
        </p>
      </div>
    </header>
  );
}
