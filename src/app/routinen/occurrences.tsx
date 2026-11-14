import type { OccurrenceView } from "@/server/services/routines";
import type { DashProfile } from "@/server/services/dashboard";
import { parseIso, weekdayIndex } from "@/lib/week";
import { Dots, names } from "../people";
import { moveOccurrenceAction, occurrenceAssigneesAction, occurrenceStatusAction } from "../planung-actions";
import { ghostButtonCls } from "../ui";

const WD = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
export const fmtDay = (iso: string) => {
  const { y, m, d } = parseIso(iso);
  return `${WD[weekdayIndex(iso)]}, ${String(d).padStart(2, "0")}.${String(m).padStart(2, "0")}.${y}`;
};

/** One routine occurrence: tick off, skip, and (folded) assign to other persons. */
export function OccurrenceRow({ o, profiles, back, today }: { o: OccurrenceView; profiles: DashProfile[]; back: string; today: string }) {
  const done = o.status === "DONE";
  const skipped = o.status === "SKIPPED";
  const late = o.status === "OPEN" && o.date < today;
  return (
    <li className="py-3" data-testid="occurrence-row">
      <div className="flex flex-wrap items-center gap-3">
        <form action={occurrenceStatusAction}>
          <input type="hidden" name="occurrenceId" value={o.id} />
          <input type="hidden" name="back" value={back} />
          <input type="hidden" name="status" value={o.status === "OPEN" ? "DONE" : "OPEN"} />
          <button className={ghostButtonCls} aria-label={o.status === "OPEN" ? `„${o.title}“ am ${fmtDay(o.date)} abhaken` : `„${o.title}“ am ${fmtDay(o.date)} wieder öffnen`}>
            {o.status === "OPEN" ? "Abhaken" : "Wieder öffnen"}
          </button>
        </form>
        <span className="min-w-0 flex-1">
          <span className={`block break-words font-medium ${done || skipped ? "text-stone-500" : ""} ${done ? "line-through" : ""}`}>
            {o.title}
            {skipped ? " (übersprungen)" : ""}
          </span>
          <span className="flex flex-wrap items-center gap-x-2 text-sm text-stone-600">
            <Dots profiles={profiles} ids={o.assigneeIds} />
            {o.assigneeIds.length ? names(profiles, o.assigneeIds) : "Niemand zugewiesen"}
            <span className={late ? "font-medium text-red-700" : ""}>
              · {fmtDay(o.date)}{o.time ? `, ${o.time} Uhr` : ""}{late ? " (überfällig)" : ""}
            </span>
            {o.movedFrom ? <span className="font-medium text-amber-800" data-testid="occurrence-moved">· verschoben vom {fmtDay(o.movedFrom)}</span> : null}
            {o.customized && !o.movedFrom ? <span>· einzeln zugewiesen</span> : null}
          </span>
        </span>
        {!done ? (
          <form action={occurrenceStatusAction}>
            <input type="hidden" name="occurrenceId" value={o.id} />
            <input type="hidden" name="back" value={back} />
            <input type="hidden" name="status" value={skipped ? "OPEN" : "SKIPPED"} />
            <button className="min-h-11 px-3 text-sm text-stone-700 underline">{skipped ? "Nicht überspringen" : "Überspringen"}</button>
          </form>
        ) : null}
      </div>
      {!done ? (
        <details className="mt-1">
          <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm text-stone-700 underline">Verschieben</summary>
          <form action={moveOccurrenceAction} className="mt-2 flex flex-wrap items-end gap-2">
            <input type="hidden" name="occurrenceId" value={o.id} />
            <input type="hidden" name="back" value={back} />
            <label className="flex flex-col text-sm">
              Tag
              <input type="date" name="date" required defaultValue={o.date} className="min-h-11 rounded-xl border border-stone-300 bg-white px-3" />
            </label>
            <label className="flex flex-col text-sm">
              Uhrzeit
              <input type="time" name="time" defaultValue={o.time ?? ""} className="min-h-11 rounded-xl border border-stone-300 bg-white px-3" />
            </label>
            <button className={ghostButtonCls}>Nur diesen verschieben</button>
          </form>
        </details>
      ) : null}
      <details className="mt-1">
        <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm text-stone-700 underline">Zuständig ändern</summary>
        <form action={occurrenceAssigneesAction} className="mt-2 flex flex-wrap items-center gap-2">
          <input type="hidden" name="occurrenceId" value={o.id} />
          <input type="hidden" name="back" value={back} />
          {profiles.map((p) => (
            <label key={p.id} className="flex min-h-11 items-center gap-2 rounded-xl border border-stone-300 bg-white px-3 text-sm">
              <input type="checkbox" name="assigneeIds" value={p.id} className="h-5 w-5" defaultChecked={o.assigneeIds.includes(p.id)} />
              {p.name}
            </label>
          ))}
          <button className={ghostButtonCls}>Speichern</button>
        </form>
      </details>
    </li>
  );
}
