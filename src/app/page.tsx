import Link from "next/link";
import type { ReactNode } from "react";
import { parseIso, weekdayIndex } from "@/lib/week";
import { getDashboard, type DashTask } from "@/server/services/dashboard";
import { requireFamily } from "@/server/session";
import { DashboardHeader } from "./clock";
import { Dots, names } from "./people";

export const dynamic = "force-dynamic";

const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const MAX_PER_DAY = 4;

function Tile({ title, href, count, children, soon }: { title: string; href?: string; count?: number; children: ReactNode; soon?: boolean }) {
  return (
    <section
      className={`rounded-2xl p-4 ring-1 ${soon ? "bg-stone-50 ring-stone-200" : "bg-white shadow-sm ring-stone-200"}`}
      aria-label={title}
      data-testid={soon ? "tile-soon" : "tile"}
    >
      <h2 className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-stone-600">
        <span>{title}</span>
        {soon ? (
          <span className="rounded-full bg-stone-200 px-2 py-0.5 text-[10px] normal-case tracking-normal text-stone-700">kommt bald</span>
        ) : count !== undefined ? (
          <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[11px] normal-case tracking-normal text-terracotta-dark">{count}</span>
        ) : null}
      </h2>
      {children}
      {href ? (
        <Link href={href} className="mt-2 inline-block py-1 text-sm text-terracotta-dark underline">
          Alle ansehen
        </Link>
      ) : null}
    </section>
  );
}

function TaskList({ tasks, profiles, empty, showDue }: { tasks: DashTask[]; profiles: Awaited<ReturnType<typeof getDashboard>>["profiles"]; empty: string; showDue?: boolean }) {
  if (tasks.length === 0) return <p className="text-sm text-stone-600">{empty}</p>;
  return (
    <ul className="space-y-1.5">
      {tasks.slice(0, 5).map((t) => (
        <li key={t.id} className="flex items-center gap-2 text-sm">
          <Dots profiles={profiles} ids={t.assigneeIds} />
          <span className="min-w-0 flex-1 truncate" title={names(profiles, t.assigneeIds)}>{t.title}</span>
          {showDue && t.due ? <span className="shrink-0 text-xs text-stone-600">{t.due.slice(8, 10)}.{t.due.slice(5, 7)}.</span> : null}
        </li>
      ))}
      {tasks.length > 5 ? <li className="text-xs text-stone-600">+{tasks.length - 5} weitere</li> : null}
    </ul>
  );
}

export default async function Home() {
  const { user, familyId } = await requireFamily();
  const now = new Date();
  const d = await getDashboard(user.id, familyId, now);
  const when = (n: number) => (n === 0 ? "heute" : n === 1 ? "morgen" : `in ${n} Tagen`);

  return (
    <div className="space-y-6">
      <DashboardHeader timeZone={d.timezone} familyName={d.familyName} initial={now.getTime()} />

      <section aria-labelledby="woche" className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-200" data-testid="week">
        <h2 id="woche" className="mb-3 text-xs font-semibold uppercase tracking-wider text-stone-600">Diese Woche</h2>
        <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-7">
          {d.week.map((day) => {
            const { d: dayNum } = parseIso(day.iso);
            const items = day.birthdays.length + day.tasks.length;
            let budget = MAX_PER_DAY;
            const shownBirthdays = day.birthdays.slice(0, budget);
            budget -= shownBirthdays.length;
            const shownTasks = day.tasks.slice(0, Math.max(budget, 0));
            const more = items - shownBirthdays.length - shownTasks.length;
            return (
              <li
                key={day.iso}
                data-testid={day.isToday ? "day-today" : "day"}
                aria-current={day.isToday ? "date" : undefined}
                className={`md:min-h-24 rounded-xl p-3 ${day.isToday ? "bg-orange-50 ring-2 ring-terracotta/60" : "bg-stone-100/70"}`}
              >
                <p className="mb-1.5 flex items-baseline justify-between text-sm font-semibold">
                  <span>{WEEKDAYS[weekdayIndex(day.iso)]}</span>
                  <span className={day.isToday ? "text-terracotta-dark" : "text-stone-600"}>{dayNum}</span>
                </p>
                <ul className="space-y-1">
                  {shownBirthdays.map((b) => (
                    <li key={b.id} className="flex items-center gap-1.5 text-sm">
                      <span aria-hidden="true">🎂</span>
                      <span className="min-w-0 break-words">{b.name}{b.turns ? ` (${b.turns})` : ""}</span>
                    </li>
                  ))}
                  {shownTasks.map((t) => (
                    <li key={t.id} className={`flex items-center gap-1.5 text-sm ${t.done ? "text-stone-500 line-through" : ""}`}>
                      <Dots profiles={d.profiles} ids={t.assigneeIds} />
                      <span className="min-w-0 break-words" title={names(d.profiles, t.assigneeIds)}>{t.title}</span>
                    </li>
                  ))}
                  {more > 0 ? <li className="text-xs text-stone-600">+{more} weitere</li> : null}
                </ul>
              </li>
            );
          })}
        </ol>
        {d.profiles.length > 0 ? (
          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-700" aria-label="Farben der Personen">
            {d.profiles.map((p) => (
              <li key={p.id} className="flex items-center gap-1.5">
                <Dots profiles={d.profiles} ids={[p.id]} /> {p.name}
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Tile title="Meine Aufgaben" href="/aufgaben" count={d.mine.length}>
          <TaskList tasks={d.mine} profiles={d.profiles} empty="Nichts offen für dich." showDue />
        </Tile>
        <Tile title="Heute fällig" href="/aufgaben" count={d.dueToday.length}>
          <TaskList tasks={d.dueToday} profiles={d.profiles} empty="Heute ist nichts fällig." />
        </Tile>
        <Tile title="Überfällig" href="/aufgaben" count={d.overdue.length}>
          <TaskList tasks={d.overdue} profiles={d.profiles} empty="Nichts überfällig." showDue />
        </Tile>
        <Tile title="Nächste Geburtstage" href="/geburtstage">
          {d.nextBirthdays.length === 0 ? (
            <p className="text-sm text-stone-600">Noch keine Geburtstage eingetragen.</p>
          ) : (
            <ul className="space-y-1.5">
              {d.nextBirthdays.map((b) => (
                <li key={b.id} className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate">{b.name}{b.turns ? ` wird ${b.turns}` : ""}</span>
                  <span className="shrink-0 text-xs text-stone-600">{when(b.inDays)}</span>
                </li>
              ))}
            </ul>
          )}
        </Tile>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {["Heute zu Hause", "Essen heute", "Schule heute", "Sterne"].map((t) => (
          <Tile key={t} title={t} soon>
            <p className="text-sm text-stone-600">Dieses Modul folgt in einer späteren Version.</p>
          </Tile>
        ))}
      </div>
    </div>
  );
}
