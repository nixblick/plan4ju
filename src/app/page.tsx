import Link from "next/link";
import { after } from "next/server";
import type { ReactNode } from "react";
import { parseIso, weekdayIndex } from "@/lib/week";
import { syncStaleCalendars } from "@/server/services/calendar";
import { getDashboard, type DashTask } from "@/server/services/dashboard";
import { activeModules } from "@/server/active-modules";
import { visibleElements, type DashboardElement } from "@/lib/dashboard-elements";
import { getDashboardLayout } from "@/server/services/dashboard-prefs";
import { requireFamily } from "@/server/session";
import { DashboardHeader } from "./clock";
import { occurrenceStatusAction } from "./planung-actions";
import { Dots, names } from "./people";
import { NextCard, TodayStrip } from "./heute";
import { CalendarBadge, timeLabel } from "./kalender/parts";

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

/** Part of the grouped task tile: one framed block per list, so the group reads as one unit on a phone. */
function SubTile({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  return (
    <section aria-label={title} className="rounded-xl bg-stone-50 p-3 ring-1 ring-stone-200" data-testid="tile">
      <h3 className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-stone-600">
        <span>{title}</span>
        <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[11px] normal-case tracking-normal text-terracotta-dark">{count}</span>
      </h3>
      {children}
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
  const [d, modules, layout] = await Promise.all([getDashboard(user.id, familyId, now), activeModules(), getDashboardLayout(user.id, familyId)]);
  // per user (Einstellungen → Module): what the family allows, minus what this user hid, in the user's order
  const show = visibleElements(modules, layout.hidden);
  const order = layout.order;
  // refresh stale calendar subscriptions after the response is sent
  after(() => syncStaleCalendars(user.id, familyId));
  const when = (n: number) => (n === -2 ? "vorgestern" : n === -1 ? "gestern" : n === 0 ? "heute" : n === 1 ? "morgen" : `in ${n} Tagen`);
  const WEEK = (
      <section aria-labelledby="woche" className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-200" data-testid="week">
        <h2 id="woche" className="mb-3 text-xs font-semibold uppercase tracking-wider text-stone-600">Diese Woche</h2>
        <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-7">
          {d.week.map((day) => {
            const { d: dayNum } = parseIso(day.iso);
            const items = day.events.length + day.birthdays.length + day.routines.length + day.tasks.length;
            let budget = MAX_PER_DAY;
            const shownEvents = day.events.slice(0, budget);
            budget -= shownEvents.length;
            const shownBirthdays = day.birthdays.slice(0, Math.max(budget, 0));
            budget -= shownBirthdays.length;
            const shownRoutines = day.routines.slice(0, Math.max(budget, 0));
            budget -= shownRoutines.length;
            const shownTasks = day.tasks.slice(0, Math.max(budget, 0));
            const more = items - shownEvents.length - shownBirthdays.length - shownRoutines.length - shownTasks.length;
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
                  {shownEvents.map((e) => (
                    <li key={`${e.key}@${day.iso}`} className="flex items-start gap-1.5 text-sm" data-testid="week-event">
                      {e.participantIds.length ? <Dots profiles={d.profiles} ids={e.participantIds} /> : null}
                      <span aria-hidden="true">{e.source === "external" ? "◇" : "◆"}</span>
                      <span className="min-w-0 break-words">
                        {e.allDay || e.startDate < day.iso ? "" : `${e.startTime} `}{e.title}
                        {e.source === "external" ? <span className="sr-only"> (externer Termin)</span> : null}
                      </span>
                    </li>
                  ))}
                  {shownBirthdays.map((b) => (
                    <li key={b.id} className="flex items-center gap-1.5 text-sm">
                      <span aria-hidden="true">🎂</span>
                      <span className="min-w-0 break-words">{b.name}{b.turns ? ` (${b.turns})` : ""}</span>
                    </li>
                  ))}
                  {shownRoutines.map((o) => (
                    <li key={o.id} className={`flex items-center gap-1.5 text-sm ${o.status === "DONE" ? "text-stone-500 line-through" : ""}`} data-testid="week-routine">
                      <Dots profiles={d.profiles} ids={o.assigneeIds} />
                      <span aria-hidden="true">↻</span>
                      <span className="min-w-0 break-words" title={names(d.profiles, o.assigneeIds)}>{o.time ? `${o.time} ` : ""}{o.title}</span>
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
        {d.profiles.some((p) => !p.former) ? (
          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-700" aria-label="Farben der Personen">
            {d.profiles.filter((p) => !p.former).map((p) => (
              <li key={p.id} className="flex items-center gap-1.5">
                <Dots profiles={d.profiles} ids={[p.id]} /> {p.name}
              </li>
            ))}
          </ul>
        ) : null}
      </section>
  );
  const mealsToday = d.mealsToday ?? [];
  const nextPickups = d.nextPickups ?? [];
  const MEALS = (
          <Tile title="Essen heute" href="/essen">
            {mealsToday.length === 0 ? (
              <p className="text-sm text-stone-600">Für heute ist noch nichts geplant.</p>
            ) : (
              <ul className="space-y-2">
                {mealsToday.map((m) => (
                  <li key={m.id} className="flex items-start gap-2 text-sm" data-testid="today-meal">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-100 text-xl" aria-hidden="true">🍽</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs text-stone-600">{m.slotName}</span>
                      {m.recipeId ? (
                        <Link href={`/rezepte/${m.recipeId}`} className="block break-words font-medium underline-offset-2 hover:underline">{m.recipeTitle}</Link>
                      ) : (
                        <span className="block break-words font-medium">{m.text}</span>
                      )}
                      <span className="flex items-center gap-1.5 text-xs text-stone-600">
                        <Dots profiles={d.profiles} ids={m.cookIds} />
                        {m.cookIds.length ? `kocht: ${names(d.profiles, m.cookIds)}` : "Noch niemand eingeteilt"}
                      </span>
                      {m.imageUrl ? (
                        <a href={m.imageUrl} target="_blank" rel="noopener noreferrer nofollow" className="text-xs text-terracotta-dark underline">Bild ansehen</a>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Tile>
  );
  const WASTE = (
            <Tile title="FES" href="/kalender/abfall">
              {nextPickups.length === 0 ? (
                <p className="text-sm text-stone-600">In den nächsten 7 Tagen keine Abfuhr.</p>
              ) : (
                <ul className="space-y-1.5" data-testid="pickups">
                  {nextPickups.map((p) => (
                    <li key={p.id} className="flex items-center gap-2 text-sm">
                      <span aria-hidden="true">🗑</span>
                      <span className="shrink-0 text-xs font-medium text-stone-700">{p.label}:</span>
                      <span className="min-w-0 break-words">{p.title}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Tile>
  );
  const EVENTS = (

      <Tile title="Termine heute" href="/kalender" count={d.eventsToday.length}>
        {d.eventsToday.length === 0 ? (
          <p className="text-sm text-stone-600">Heute stehen keine Termine an.</p>
        ) : (
          <ul className="space-y-1.5">
            {d.eventsToday.map((e) => (
              <li key={e.key} className="flex flex-wrap items-center gap-x-2 text-sm" data-testid="today-event">
                <span className="shrink-0 font-medium text-stone-700">{timeLabel(e, d.today)}</span>
                <span className="min-w-0 break-words">{e.title}</span>
                {e.location ? <span className="text-xs text-stone-600">📍 {e.location}</span> : null}
                {e.participantIds.length ? <Dots profiles={d.profiles} ids={e.participantIds} /> : null}
                {e.source === "external" && e.calendarName ? <CalendarBadge name={e.calendarName} colorIndex={e.colorIndex} /> : null}
              </li>
            ))}
          </ul>
        )}
      </Tile>
  );
  const ROUTINES = (
      <Tile title="Routinen heute" href="/routinen" count={d.routinesToday.filter((o) => o.status === "OPEN").length}>
        {d.routinesToday.length === 0 ? (
          <p className="text-sm text-stone-600">Heute stehen keine Routinen an.</p>
        ) : (
          <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
            {d.routinesToday.map((o) => (
              <li key={o.id} className="flex items-center gap-2 text-sm" data-testid="today-routine">
                <form action={occurrenceStatusAction}>
                  <input type="hidden" name="occurrenceId" value={o.id} />
                  <input type="hidden" name="back" value="/" />
                  <input type="hidden" name="status" value={o.status === "DONE" ? "OPEN" : "DONE"} />
                  <button
                    className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-stone-300 bg-white text-lg"
                    aria-label={o.status === "DONE" ? `„${o.title}“ wieder öffnen` : `„${o.title}“ heute abhaken`}
                  >
                    {o.status === "DONE" ? "✓" : "○"}
                  </button>
                </form>
                <Dots profiles={d.profiles} ids={o.assigneeIds} />
                <span className={`min-w-0 flex-1 break-words ${o.status === "DONE" ? "text-stone-500 line-through" : ""}`}>
                  {o.time ? `${o.time} ` : ""}{o.title}
                  <span className="text-xs text-stone-600"> · {o.assigneeIds.length ? names(d.profiles, o.assigneeIds) : "Niemand zugewiesen"}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Tile>
  );
  const TASKS = (
        <section aria-labelledby="aufgaben-gruppe" className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-200" data-testid="tasks-group">
          <h2 id="aufgaben-gruppe" className="mb-3 flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-stone-600">
            <span>Aufgaben</span>
            <Link href="/aufgaben" className="py-1 text-sm normal-case tracking-normal text-terracotta-dark underline">Alle ansehen</Link>
          </h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <SubTile title="Meine Aufgaben" count={d.mine.length}>
              <TaskList tasks={d.mine} profiles={d.profiles} empty="Nichts offen für dich." showDue />
            </SubTile>
            <SubTile title="Heute fällig" count={d.dueToday.length}>
              <TaskList tasks={d.dueToday} profiles={d.profiles} empty="Heute ist nichts fällig." />
            </SubTile>
            <SubTile title="Überfällig" count={d.overdue.length}>
              <TaskList tasks={d.overdue} profiles={d.profiles} empty="Nichts überfällig." showDue />
            </SubTile>
          </div>
        </section>
  );
  const BIRTHDAYS = (
        <Tile title="Geburtstage" href="/kalender/geburtstage">
          {d.nextBirthdays.length === 0 ? (
            <p className="text-sm text-stone-600">Keine Geburtstage von vorgestern bis in 3 Tagen.</p>
          ) : (
            <ul className="space-y-1.5">
              {d.nextBirthdays.map((b) => (
                <li key={b.id} className="flex items-baseline justify-between gap-2 text-sm" data-testid="birthday-near">
                  <span className="min-w-0 truncate">{b.name}{b.turns ? (b.inDays < 0 ? ` wurde ${b.turns}` : ` wird ${b.turns}`) : ""}</span>
                  <span className="shrink-0 text-xs text-stone-600">{when(b.inDays)}</span>
                </li>
              ))}
            </ul>
          )}
        </Tile>
  );
  const MINDFULNESS = (
          <Tile title="Achtsamkeit">
            <p className="text-sm text-stone-600">Wie war dein Tag? Ein kurzer Eintrag hilft, den Überblick zu behalten.</p>
            <Link href="/achtsamkeit" className="mt-2 inline-flex min-h-11 items-center rounded-xl bg-orange-100 px-4 text-sm font-medium text-terracotta-dark">
              Eintrag für heute
            </Link>
          </Tile>
  );
  const soon = (title: string) => (
    <Tile title={title} soon>
      <p className="text-sm text-stone-600">Dieses Modul folgt in einer späteren Version.</p>
    </Tile>
  );
  const SOON_SCHOOL = soon("Schule heute");
  const SOON_STARS = soon("Sterne");

  const blocks: Record<DashboardElement, ReactNode> = {
    next: <NextCard d={d} now={now} />,
    today: <TodayStrip d={d} now={now} />,
    week: WEEK,
    meals: d.mealsToday ? MEALS : null,
    waste: d.nextPickups ? WASTE : null,
    school: SOON_SCHOOL,
    stars: SOON_STARS,
    events: EVENTS,
    routines: ROUTINES,
    tasks: TASKS,
    birthdays: BIRTHDAYS,
    mindfulness: MINDFULNESS,
  };

  return (
    <div className="space-y-6">
      <DashboardHeader timeZone={d.timezone} familyName={d.familyName} initial={now.getTime()} />
      {order.filter((k) => show.has(k)).map((k) => (
        <div key={k} className="min-w-0" data-element={k}>{blocks[k]}</div>
      ))}
    </div>
  );
}
