import type { DashProfile } from "@/server/services/dashboard";
import { Dots } from "../people";
import { Field, inputCls } from "../ui";

export const PRIORITY_LABEL = { LOW: "Niedrig", NORMAL: "Normal", HIGH: "Hoch" } as const;
export const STATUS_LABEL = { OPEN: "Offen", IN_PROGRESS: "In Bearbeitung", DONE: "Erledigt" } as const;

export interface TaskValues {
  title: string;
  description: string | null;
  dueDate: Date | null;
  dueTime: string | null;
  priority: keyof typeof PRIORITY_LABEL;
  status: keyof typeof STATUS_LABEL;
  assigneeIds: string[];
}

/** Form fields shared by "new task" and "edit task". `t` = current values when editing. */
export function TaskFields({ profiles, t }: { profiles: DashProfile[]; t?: TaskValues }) {
  return (
    <>
      <Field label="Was ist zu tun?">
        <input className={inputCls} name="title" maxLength={200} defaultValue={t?.title} required />
      </Field>
      <Field label="Beschreibung (optional)">
        <textarea className={inputCls} name="description" rows={3} maxLength={2000} defaultValue={t?.description ?? ""} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Fällig am (optional)">
          <input className={inputCls} type="date" name="dueDate" defaultValue={t?.dueDate ? t.dueDate.toISOString().slice(0, 10) : ""} />
        </Field>
        <Field label="Uhrzeit (optional)">
          <input className={inputCls} type="time" name="dueTime" defaultValue={t?.dueTime ?? ""} />
        </Field>
      </div>
      <div className={`grid gap-3 ${t ? "grid-cols-2" : "grid-cols-1"}`}>
        <Field label="Priorität">
          <select className={inputCls} name="priority" defaultValue={t?.priority ?? "NORMAL"}>
            {Object.entries(PRIORITY_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </Field>
        {t ? (
          <Field label="Status">
            <select className={inputCls} name="status" defaultValue={t.status}>
              {Object.entries(STATUS_LABEL).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </Field>
        ) : null}
      </div>
      <fieldset className="mb-4">
        <legend className="mb-1 text-sm font-medium">Zuständig (keiner, eine oder mehrere Personen)</legend>
        <div className="flex flex-wrap gap-2">
          {profiles.map((p) => (
            <label key={p.id} className="flex min-h-11 items-center gap-2 rounded-xl border border-stone-300 bg-white px-3">
              <input type="checkbox" name="assigneeIds" value={p.id} className="h-5 w-5" defaultChecked={t?.assigneeIds.includes(p.id)} />
              <Dots profiles={profiles} ids={[p.id]} />
              {p.name}
            </label>
          ))}
        </div>
      </fieldset>
    </>
  );
}
