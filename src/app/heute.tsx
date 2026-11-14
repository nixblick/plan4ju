import Link from "next/link";
import {
  agendaOf, buildStrip, inLabel, nextUp, nowLine, nowMinutes, STRIP_FROM, STRIP_TO, type AgendaEntry,
} from "@/lib/today-agenda";
import { personColor } from "@/lib/colors";
import type { DashboardData } from "@/server/services/dashboard";
import { Avatar, colorOf, names } from "./people";

type Profiles = DashboardData["profiles"];

function Who({ profiles, ids }: { profiles: Profiles; ids: string[] }) {
  const list = ids.map((id) => profiles.find((p) => p.id === id)).filter((p): p is NonNullable<typeof p> => Boolean(p));
  if (!list.length) return <span className="text-stone-600">Alle</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {list.map((p) => (
        <span key={p.id} className="inline-flex items-center gap-1.5">
          <Avatar name={p.name} colorIndex={p.colorIndex} size={24} />
          <span>{p.name}</span>
        </span>
      ))}
    </span>
  );
}

const timeRange = (a: AgendaEntry) => {
  const from = a.since === a.startTime ? a.startTime : a.since;
  if (a.endTime) return `${from}–${a.endTime}`;
  return a.kind === "event" && a.end >= 24 * 60 ? `${from}, mehrtägig` : from;
};

/** "Als Nächstes" and "Danach": the next timed event or routine today, then up to three more. */
export function NextCard({ d, now }: { d: DashboardData; now: Date }) {
  const agenda = agendaOf(d.today, d.eventsToday, d.routinesToday);
  const { next, inMinutes, running, after } = nextUp(agenda, nowMinutes(now, d.timezone));
  return (
    <section
      aria-label="Als Nächstes"
      data-testid="next-card"
      className="grid gap-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-200 sm:p-5 md:grid-cols-[3fr_2fr] md:gap-6"
    >
      <div className="min-w-0">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-terracotta-dark">
          Als Nächstes{next && inMinutes !== null ? <span data-testid="next-in"> · {running ? `läuft seit ${next.since}` : inLabel(inMinutes)}</span> : null}
        </h2>
        {next ? (
          <div className="mt-2 space-y-2" data-testid="next-entry">
            <p className="break-words text-3xl font-bold tracking-tight sm:text-4xl">{next.title}</p>
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-base text-stone-700">
              <Who profiles={d.profiles} ids={next.personIds} />
              <span aria-hidden="true">·</span>
              <span>{timeRange(next)}</span>
              {next.kind === "routine" ? <span className="text-sm text-stone-600">(Routine)</span> : null}
            </p>
            {next.location ? <p className="text-sm text-terracotta-dark">📍 {next.location}</p> : null}
          </div>
        ) : (
          <p className="mt-3 text-base text-stone-700">Heute steht nichts mehr mit Uhrzeit an.</p>
        )}
      </div>
      <div className="min-w-0 md:border-l md:border-stone-200 md:pl-6">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-stone-600">Danach</h3>
        {after.length === 0 ? (
          <p className="text-sm text-stone-600">Danach ist nichts geplant.</p>
        ) : (
          <ul className="space-y-1.5">
            {after.map((a) => (
              <li key={a.key} className="flex items-center gap-2 rounded-xl bg-stone-50 px-2.5 py-2 text-sm ring-1 ring-stone-200" data-testid="after-entry">
                {a.personIds.length ? <Avatar name={names(d.profiles, [a.personIds[0]!])} colorIndex={d.profiles.find((p) => p.id === a.personIds[0])?.colorIndex ?? 0} size={24} /> : null}
                <span className="font-semibold">{a.since}</span>
                <span className="min-w-0 truncate" title={a.title}>{a.title}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/** "Heute zu Hause": one row per person on a 6-22 h strip with the line for now. */
export function TodayStrip({ d, now }: { d: DashboardData; now: Date }) {
  const agenda = agendaOf(d.today, d.eventsToday, d.routinesToday);
  const rows = buildStrip(agenda, d.profiles.map((p) => p.id));
  const line = nowLine(nowMinutes(now, d.timezone));
  const allDay = d.eventsToday.filter((e) => e.allDay);
  const ticks = Array.from({ length: (STRIP_TO - STRIP_FROM) / 2 + 1 }, (_, i) => STRIP_FROM + i * 2);
  const empty = rows.every((r) => r.bars.length === 0);
  return (
    <section aria-label="Heute zu Hause" data-testid="today-strip" className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-200">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-stone-600">Heute zu Hause</h2>
      {allDay.length ? (
        <p className="mb-2 text-sm text-stone-700">
          <span className="text-stone-600">Ganztägig: </span>
          {allDay.map((e) => e.title).join(", ")}
        </p>
      ) : null}
      {d.profiles.length === 0 ? (
        <p className="text-sm text-stone-600">Noch keine Personen angelegt.</p>
      ) : (
        <div className="relative grid grid-cols-[2rem_minmax(0,1fr)] gap-x-2 gap-y-1.5 sm:grid-cols-[2.25rem_minmax(0,1fr)] sm:gap-x-3">
          <span />
          <div className="relative h-5 text-xs text-stone-600" aria-hidden="true">
            {ticks.map((h, i) => (
              <span
                key={h}
                className={`absolute -translate-x-1/2 ${i % 2 === 1 ? "hidden sm:inline" : ""}`}
                style={{ left: `${(i / (ticks.length - 1)) * 100}%` }}
              >
                {h}
              </span>
            ))}
          </div>
          {rows.map((row) => {
            const p = d.profiles.find((x) => x.id === row.profileId);
            return (
              <div key={row.profileId ?? "shared"} className="contents" data-testid="strip-row" data-person={p?.name ?? "Alle"}>
                <div className="flex h-10 items-center">
                  {p ? <Avatar name={p.name} colorIndex={p.colorIndex} size={28} /> : <span className="text-xs text-stone-600">Alle</span>}
                </div>
                <div className="relative h-10 overflow-hidden rounded-lg bg-stone-50 ring-1 ring-stone-100">
                  {ticks.slice(1, -1).map((h, i) => (
                    <span key={h} aria-hidden="true" className="absolute inset-y-0 w-px bg-stone-200/80" style={{ left: `${((i + 1) / (ticks.length - 1)) * 100}%` }} />
                  ))}
                  {row.bars.map((b) => {
                    const c = p ? personColor(p.colorIndex) : colorOf(d.profiles, undefined);
                    return (
                      <span
                        key={b.key}
                        data-testid="strip-bar"
                        title={`${b.startTime} ${b.title}`}
                        className={`absolute inset-y-1 flex min-w-1.5 items-center overflow-hidden rounded-md px-1.5 text-xs font-medium ${b.done ? "line-through opacity-60" : ""}`}
                        style={{ left: `${b.left}%`, width: `${b.width}%`, background: c.bg, color: c.fg, borderLeft: `3px solid ${c.solid}` }}
                      >
                        <span className="truncate">{b.kind === "routine" ? "↻ " : ""}{b.title}</span>
                      </span>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {line !== null ? (
            <div className="pointer-events-none absolute inset-y-0 left-[2.5rem] right-0 sm:left-[3rem]" aria-hidden="true">
              <span data-testid="now-line" className="absolute inset-y-0 w-0.5 bg-terracotta" style={{ left: `${line}%` }} />
            </div>
          ) : null}
        </div>
      )}
      {empty && d.profiles.length > 0 ? (
        <p className="mt-2 text-sm text-stone-600">
          Heute stehen keine Termine mit Uhrzeit an. <Link href="/kalender/termin/neu" className="text-terracotta-dark underline">Termin anlegen</Link>
        </p>
      ) : null}
    </section>
  );
}
