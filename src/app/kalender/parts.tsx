import Link from "next/link";
import { personColor } from "@/lib/colors";
import { itemsOnDay, type CalendarItem } from "@/lib/calendar-items";
import type { CalendarViewData } from "@/server/services/calendar-view";
import type { DashProfile } from "@/server/services/dashboard";
import { Dots, names } from "../people";

const dm = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.`;

/** Colour chip of an external calendar (the colour is also named in text next to it). */
export function CalendarBadge({ name, colorIndex }: { name: string; colorIndex: number | null }) {
  const c = personColor(colorIndex ?? 0);
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: c.bg, color: c.fg }}>
      <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full" style={{ background: c.solid }} />
      Extern · {name}
    </span>
  );
}

export function timeLabel(i: CalendarItem, day: string): string {
  if (i.allDay) return i.startDate === i.endDate ? "ganztägig" : `ganztägig bis ${dm(i.endDate)}`;
  if (i.startDate < day) return i.endDate === day && i.endTime ? `bis ${i.endTime} Uhr` : `bis ${dm(i.endDate)}`;
  if (i.endDate > i.startDate) return `${i.startTime} Uhr bis ${dm(i.endDate)}`;
  return i.endTime && i.endTime !== i.startTime ? `${i.startTime}–${i.endTime} Uhr` : `${i.startTime} Uhr`;
}

export function ItemRow({ item, day, profiles }: { item: CalendarItem; day: string; profiles: DashProfile[] }) {
  const external = item.source === "external";
  return (
    <li className="py-2" data-testid={external ? "cal-item-external" : "cal-item"}>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="shrink-0 text-sm font-medium text-stone-700">{timeLabel(item, day)}</span>
        {external ? (
          <span className="min-w-0 break-words font-medium">{item.title}</span>
        ) : (
          <Link href={`/kalender/termin/${item.id}`} className="min-w-0 break-words font-medium underline decoration-stone-300 underline-offset-2">
            {item.title}
          </Link>
        )}
        {item.repeats ? <span className="text-xs text-stone-600" title="Wiederholt sich">↻</span> : null}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-stone-600">
        {item.location ? <span className="break-words">📍 {item.location}</span> : null}
        {item.participantIds.length ? (
          <span className="flex items-center gap-1.5">
            <Dots profiles={profiles} ids={item.participantIds} />
            {names(profiles, item.participantIds)}
          </span>
        ) : null}
        {external && item.calendarName ? <CalendarBadge name={item.calendarName} colorIndex={item.colorIndex} /> : null}
      </div>
      {item.description ? (
        <details className="text-sm">
          <summary className="inline-flex min-h-11 cursor-pointer items-center text-stone-700 underline">Mehr</summary>
          {/* plain text only: calendar descriptions are never interpreted as HTML */}
          <p className="whitespace-pre-wrap break-words text-stone-700">{item.description}</p>
        </details>
      ) : null}
    </li>
  );
}

/** Everything of one day: events, birthdays, routines, tasks. */
export function DayEntries({ iso, data }: { iso: string; data: CalendarViewData }) {
  const items = itemsOnDay(data.items, iso);
  const birthdays = data.birthdays.filter((b) => b.date === iso);
  const routines = data.routines.filter((o) => o.date === iso);
  const tasks = data.tasks.filter((t) => t.due === iso);
  if (!items.length && !birthdays.length && !routines.length && !tasks.length) return <p className="py-2 text-sm text-stone-600">Nichts geplant.</p>;
  return (
    <ul className="divide-y divide-stone-100">
      {items.map((i) => (
        <ItemRow key={`${i.key}@${iso}`} item={i} day={iso} profiles={data.profiles} />
      ))}
      {birthdays.map((b) => (
        <li key={b.id} className="py-2 text-sm">
          <span aria-hidden="true">🎂</span> {b.name}{b.turns ? ` wird ${b.turns}` : ""} hat Geburtstag
        </li>
      ))}
      {routines.map((o) => (
        <li key={o.id} className={`py-2 text-sm ${o.status === "DONE" ? "text-stone-500 line-through" : ""}`}>
          <Link href="/routinen" className="underline decoration-stone-300 underline-offset-2">
            <span aria-hidden="true">↻</span> {o.time ? `${o.time} ` : ""}{o.title}
          </Link>
          <span className="text-stone-600"> · Routine{o.assigneeIds.length ? `, ${names(data.profiles, o.assigneeIds)}` : ""}</span>
        </li>
      ))}
      {tasks.map((t) => (
        <li key={t.id} className={`py-2 text-sm ${t.done ? "text-stone-500 line-through" : ""}`}>
          <Link href={`/aufgaben/${t.id}`} className="underline decoration-stone-300 underline-offset-2">
            <span aria-hidden="true">☐</span> {t.time ? `${t.time} ` : ""}{t.title}
          </Link>
          <span className="text-stone-600"> · Aufgabe{t.assigneeIds.length ? `, ${names(data.profiles, t.assigneeIds)}` : ""}</span>
        </li>
      ))}
    </ul>
  );
}
