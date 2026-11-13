import type { DashProfile } from "@/server/services/dashboard";
import { Dots } from "../people";
import { Field, inputCls } from "../ui";

const WD = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];

export interface RoutineValues {
  title: string;
  description: string | null;
  freq: "DAILY" | "WEEKLY" | "MONTHLY";
  interval: number;
  weekdays: number[];
  monthDay: number | null;
  startDate: string;
  endDate: string | null;
  timeOfDay: string | null;
  assignMode: "FIXED" | "ROTATING" | "PER_OCCURRENCE";
  assigneeIds: string[];
}

/** Fields shared by "new routine" and "edit routine". */
export function RoutineFields({ profiles, v }: { profiles: DashProfile[]; v: RoutineValues }) {
  return (
    <>
      <Field label="Titel">
        <input className={inputCls} name="title" maxLength={200} defaultValue={v.title} required />
      </Field>
      <Field label="Beschreibung (optional)">
        <textarea className={inputCls} name="description" rows={2} maxLength={2000} defaultValue={v.description ?? ""} />
      </Field>

      <fieldset className="mb-4 rounded-xl border border-stone-200 p-3">
        <legend className="px-1 text-sm font-medium">Wiederholung</legend>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Wie oft?">
            <select className={inputCls} name="freq" defaultValue={v.freq}>
              <option value="DAILY">Täglich</option>
              <option value="WEEKLY">Wöchentlich (bestimmte Wochentage)</option>
              <option value="MONTHLY">Monatlich</option>
            </select>
          </Field>
          <Field label="Alle … (Tage, Wochen, Monate)">
            <input className={inputCls} type="number" name="interval" min={1} max={52} defaultValue={v.interval} required />
          </Field>
        </div>
        <fieldset className="mb-4">
          <legend className="mb-1 text-sm font-medium">Wochentage (nur bei „Wöchentlich“)</legend>
          <div className="flex flex-wrap gap-2">
            {WD.map((n, i) => (
              <label key={n} className="flex min-h-11 items-center gap-2 rounded-xl border border-stone-300 bg-white px-3">
                <input type="checkbox" name="weekdays" value={i} className="h-5 w-5" defaultChecked={v.weekdays.includes(i)} />
                {n.slice(0, 2)}
                <span className="sr-only">{n.slice(2)}</span>
              </label>
            ))}
          </div>
          <p className="mt-1 text-xs text-stone-600">Ohne Auswahl gilt der Wochentag des Startdatums.</p>
        </fieldset>
        <Field label="Tag im Monat (nur bei „Monatlich“, 1–31)">
          <input className={inputCls} type="number" name="monthDay" min={1} max={31} defaultValue={v.monthDay ?? ""} />
        </Field>
        <p className="-mt-2 mb-4 text-xs text-stone-600">Kurze Monate nehmen ihren letzten Tag. Ohne Angabe gilt der Tag des Startdatums.</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start am">
            <input className={inputCls} type="date" name="startDate" defaultValue={v.startDate} required />
          </Field>
          <Field label="Ende am (optional)">
            <input className={inputCls} type="date" name="endDate" defaultValue={v.endDate ?? ""} />
          </Field>
        </div>
        <Field label="Uhrzeit (optional)">
          <input className={inputCls} type="time" name="timeOfDay" defaultValue={v.timeOfDay ?? ""} />
        </Field>
      </fieldset>

      <fieldset className="mb-4 rounded-xl border border-stone-200 p-3">
        <legend className="px-1 text-sm font-medium">Zuständigkeit</legend>
        <div className="mb-3 space-y-2">
          {(
            [
              ["FIXED", "Fest: die gewählten Personen sind bei jedem Termin zuständig"],
              ["ROTATING", "Im Wechsel: reihum, in der Reihenfolge der Liste unten"],
              ["PER_OCCURRENCE", "Je Termin einzeln: ich lege es bei jedem Termin fest"],
            ] as const
          ).map(([k, label]) => (
            <label key={k} className="flex min-h-11 items-center gap-3 text-sm">
              <input type="radio" name="assignMode" value={k} className="h-5 w-5" defaultChecked={v.assignMode === k} />
              {label}
            </label>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {profiles.map((p) => (
            <label key={p.id} className="flex min-h-11 items-center gap-2 rounded-xl border border-stone-300 bg-white px-3">
              <input type="checkbox" name="assigneeIds" value={p.id} className="h-5 w-5" defaultChecked={v.assigneeIds.includes(p.id)} />
              <Dots profiles={profiles} ids={[p.id]} />
              {p.name}
            </label>
          ))}
        </div>
      </fieldset>
    </>
  );
}
