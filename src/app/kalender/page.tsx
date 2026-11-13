import Link from "next/link";
import { after } from "next/server";
import { personColor } from "@/lib/colors";
import { itemsOnDay } from "@/lib/calendar-items";
import { errorMessages, okMessages, one } from "@/lib/messages";
import { addDays, parseIso, toIso, weekOf } from "@/lib/week";
import { syncStaleCalendars } from "@/server/services/calendar";
import { getCalendarView, getFamilyToday } from "@/server/services/calendar-view";
import { requireFamily } from "@/server/session";
import { buttonCls, Card, ghostButtonCls, Notice } from "../ui";
import { fmtDay } from "../routinen/occurrences";
import { DayEntries } from "./parts";

export const dynamic = "force-dynamic";

const MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const WD = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const validDay = (s: string | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && toIso(parseIso(s)) === s && s >= "2000-01-01" && s <= "2100-12-31";
const addMonths = (iso: string, n: number) => {
  const { y, m } = parseIso(iso);
  const t = y * 12 + (m - 1) + n;
  return toIso({ y: Math.floor(t / 12), m: (t % 12) + 1, d: 1 });
};

export default async function Kalender({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { user, familyId } = await requireFamily();
  const sp = await searchParams;
  const now = new Date();
  const month = one(sp.ansicht) === "monat";
  const wanted = one(sp.datum);
  // the "today" of the family decides the default, not the server clock zone
  const today = await getFamilyToday(user.id, familyId, now);
  const anchor = validDay(wanted) ? wanted : today;

  const first = month ? toIso({ ...parseIso(anchor), d: 1 }) : anchor;
  const from = weekOf(first)[0]!;
  const lastOfMonth = addDays(addMonths(first, 1), -1);
  const to = month ? weekOf(lastOfMonth)[6]! : weekOf(anchor)[6]!;
  const data = await getCalendarView(user.id, familyId, from, to, now);
  // refresh stale subscriptions after the response was sent; the page never waits for another server
  after(() => syncStaleCalendars(user.id, familyId));

  const tag = one(sp.tag);
  const inView = (d: string) => d >= from && d <= to && (!month || d.slice(0, 7) === first.slice(0, 7));
  const selected = validDay(tag) && inView(tag) ? tag : inView(today) ? today : month ? first : anchor;
  const fehler = one(sp.fehler);
  const ok = one(sp.ok);
  const view = month ? "monat" : "woche";
  const link = (o: { datum?: string; ansicht?: string; tag?: string }) => {
    const q = new URLSearchParams({ ansicht: o.ansicht ?? view, datum: o.datum ?? anchor });
    if (o.tag) q.set("tag", o.tag);
    return `/kalender?${q.toString()}`;
  };
  const prev = month ? addMonths(first, -1) : addDays(anchor, -7);
  const next = month ? addMonths(first, 1) : addDays(anchor, 7);
  const days = month ? Array.from({ length: (Date.parse(to) - Date.parse(from)) / 86_400_000 + 1 }, (_, i) => addDays(from, i)) : weekOf(anchor);
  const heading = month
    ? `${MONTHS[parseIso(first).m - 1]} ${parseIso(first).y}`
    : `${fmtDay(weekOf(anchor)[0]!).slice(4)} bis ${fmtDay(weekOf(anchor)[6]!).slice(4)}`;
  const navCls = "inline-flex min-h-11 items-center justify-center rounded-xl border border-stone-300 bg-white px-3 font-medium hover:bg-stone-50";
  const tab = (active: boolean) => `${navCls} ${active ? "bg-orange-100 text-terracotta-dark" : ""}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Kalender</h1>
        <Link href={`/kalender/termin/neu?datum=${selected}`} className={buttonCls}>Neuer Termin</Link>
      </div>
      {fehler ? <Notice kind="error">{errorMessages[fehler] ?? "Das hat nicht geklappt."}</Notice> : null}
      {ok ? <Notice kind="ok">{okMessages[ok] ?? "Gespeichert."}</Notice> : null}

      <div className="flex flex-wrap items-center gap-2" role="navigation" aria-label="Kalenderansicht">
        <Link href={link({ ansicht: "woche" })} className={tab(!month)} aria-current={!month ? "page" : undefined}>Woche</Link>
        <Link href={link({ ansicht: "monat" })} className={tab(month)} aria-current={month ? "page" : undefined}>Monat</Link>
        <span className="mx-1 hidden sm:inline" />
        <Link href={link({ datum: prev })} className={navCls} aria-label={month ? "Voriger Monat" : "Vorige Woche"}>←</Link>
        <Link href={link({ datum: today })} className={navCls}>Heute</Link>
        <Link href={link({ datum: next })} className={navCls} aria-label={month ? "Nächster Monat" : "Nächste Woche"}>→</Link>
      </div>

      <h2 className="text-lg font-semibold" data-testid="cal-heading">{heading}</h2>

      {month ? (
        <>
          <section aria-label="Monatsübersicht" className="rounded-2xl bg-white p-2 shadow-sm ring-1 ring-stone-200 sm:p-4" data-testid="cal-month">
            <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-stone-600">
              {WD.map((d) => <span key={d}>{d}</span>)}
            </div>
            <div className="mt-1 grid grid-cols-7 gap-1">
              {days.map((iso) => {
                const items = itemsOnDay(data.items, iso);
                const extra = data.birthdays.filter((b) => b.date === iso).length + data.routines.filter((o) => o.date === iso).length + data.tasks.filter((t) => t.due === iso).length;
                const count = items.length + extra;
                const inMonth = iso.slice(0, 7) === first.slice(0, 7);
                const sel = iso === selected;
                return (
                  <Link
                    key={iso}
                    href={link({ tag: iso })}
                    aria-label={`${fmtDay(iso)}, ${count === 0 ? "nichts geplant" : `${count} Einträge`}`}
                    aria-current={iso === today ? "date" : undefined}
                    className={`flex min-h-12 min-w-0 flex-col items-center rounded-lg px-0.5 py-1 text-sm ${sel ? "bg-orange-100 ring-2 ring-terracotta/60" : iso === today ? "ring-2 ring-terracotta/40" : "hover:bg-stone-50"} ${inMonth ? "" : "text-stone-500"}`}
                    data-testid="cal-cell"
                  >
                    <span className={iso === today ? "font-bold text-terracotta-dark" : ""}>{parseIso(iso).d}</span>
                    <span className="mt-0.5 flex flex-wrap justify-center gap-0.5" aria-hidden="true">
                      {items.slice(0, 3).map((i) => (
                        <span key={i.key} className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: i.source === "external" ? personColor(i.colorIndex ?? 0).solid : "#b4532a" }} />
                      ))}
                      {count > 3 || (items.length < 3 && extra > 0) ? <span className="inline-block h-1.5 w-1.5 rounded-full bg-stone-400" /> : null}
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>
          <Card title={fmtDay(selected) + (selected === today ? " (heute)" : "")}>
            <DayEntries iso={selected} data={data} />
            <p className="mt-2">
              <Link href={`/kalender/termin/neu?datum=${selected}`} className={ghostButtonCls}>Termin für diesen Tag</Link>
            </p>
          </Card>
        </>
      ) : (
        <div className="space-y-3" data-testid="cal-week">
          {days.map((iso) => (
            <section
              key={iso}
              aria-label={fmtDay(iso)}
              className={`rounded-2xl p-4 shadow-sm ring-1 ${iso === today ? "bg-orange-50 ring-terracotta/60" : "bg-white ring-stone-200"}`}
              data-testid={iso === today ? "cal-day-today" : "cal-day"}
            >
              <h3 className={`text-sm font-semibold ${iso === today ? "text-terracotta-dark" : "text-stone-700"}`}>
                {fmtDay(iso)}{iso === today ? " (heute)" : ""}
              </h3>
              <DayEntries iso={iso} data={data} />
            </section>
          ))}
        </div>
      )}

      <p className="text-sm text-stone-700">
        <Link href="/kalender/quellen" className="inline-flex min-h-11 items-center underline">Externe Kalender verwalten (ICS-Datei oder Abo)</Link>
      </p>
    </div>
  );
}
