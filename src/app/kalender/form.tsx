import type { DashProfile } from "@/server/services/dashboard";
import { Dots } from "../people";
import { Field, inputCls } from "../ui";

const WD = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];

export interface EventValues {
  title: string;
  description: string | null;
  location: string | null;
  allDay: boolean;
  startDate: string;
  startTime: string | null;
  endDate: string | null;
  endTime: string | null;
  freq: "DAILY" | "WEEKLY" | "MONTHLY" | null;
  interval: number;
  weekdays: number[];
  monthDay: number | null;
  repeatUntil: string | null;
  participantIds: string[];
}

/** Fields shared by "new event" and "edit event". */
export function EventFields({ profiles, v }: { profiles: DashProfile[]; v: EventValues }) {
  return (
    <>
      <Field label="Titel">
        <input className={inputCls} name="title" maxLength={200} defaultValue={v.title} required />
      </Field>
      <Field label="Ort (optional)">
        <input className={inputCls} name="location" maxLength={300} defaultValue={v.location ?? ""} />
      </Field>
      <Field label="Beschreibung (optional)">
        <textarea className={inputCls} name="description" rows={2} maxLength={4000} defaultValue={v.description ?? ""} />
      </Field>

      <fieldset className="mb-4 rounded-xl border border-stone-200 p-3">
        <legend className="px-1 text-sm font-medium">Wann</legend>
        <label className="mb-3 flex min-h-11 items-center gap-3 text-sm">
          <input type="checkbox" name="allDay" value="1" className="h-5 w-5" defaultChecked={v.allDay} />
          Ganztägig (die Uhrzeiten werden dann nicht verwendet)
        </label>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Beginn am">
            <input className={inputCls} type="date" name="startDate" defaultValue={v.startDate} required />
          </Field>
          <Field label="Beginn um">
            <input className={inputCls} type="time" name="startTime" defaultValue={v.startTime ?? ""} />
          </Field>
          <Field label="Ende am (leer = gleicher Tag)">
            <input className={inputCls} type="date" name="endDate" defaultValue={v.endDate ?? ""} />
          </Field>
          <Field label="Ende um (leer = wie Beginn)">
            <input className={inputCls} type="time" name="endTime" defaultValue={v.endTime ?? ""} />
          </Field>
        </div>
        <p className="text-xs text-stone-600">Alle Uhrzeiten gelten in der Zeitzone der Familie.</p>
      </fieldset>

      <fieldset className="mb-4 rounded-xl border border-stone-200 p-3">
        <legend className="px-1 text-sm font-medium">Wiederholung</legend>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Wie oft?">
            <select className={inputCls} name="freq" defaultValue={v.freq ?? ""}>
              <option value="">Einmalig</option>
              <option value="DAILY">Täglich</option>
              <option value="WEEKLY">Wöchentlich (bestimmte Wochentage)</option>
              <option value="MONTHLY">Monatlich</option>
            </select>
          </Field>
          <Field label="Alle … (Tage, Wochen, Monate)">
            <input className={inputCls} type="number" name="interval" min={1} max={52} defaultValue={v.interval} />
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
          <p className="mt-1 text-xs text-stone-600">Ohne Auswahl gilt der Wochentag des Beginns.</p>
        </fieldset>
        <Field label="Tag im Monat (nur bei „Monatlich“, 1–31)">
          <input className={inputCls} type="number" name="monthDay" min={1} max={31} defaultValue={v.monthDay ?? ""} />
        </Field>
        <Field label="Wiederholen bis (optional)">
          <input className={inputCls} type="date" name="repeatUntil" defaultValue={v.repeatUntil ?? ""} />
        </Field>
      </fieldset>

      <fieldset className="mb-4 rounded-xl border border-stone-200 p-3">
        <legend className="px-1 text-sm font-medium">Wer ist dabei?</legend>
        <div className="flex flex-wrap gap-2">
          {profiles.map((p) => (
            <label key={p.id} className="flex min-h-11 items-center gap-2 rounded-xl border border-stone-300 bg-white px-3">
              <input type="checkbox" name="participantIds" value={p.id} className="h-5 w-5" defaultChecked={v.participantIds.includes(p.id)} />
              <Dots profiles={profiles} ids={[p.id]} />
              {p.name}
            </label>
          ))}
        </div>
      </fieldset>
    </>
  );
}
