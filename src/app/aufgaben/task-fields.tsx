import type { DashProfile } from "@/server/services/dashboard";
import { Dots } from "../people";
import { DEFAULT_PRIORITY, PRIORITIES, PRIORITY_BADGE, PRIORITY_LABEL, type Priority } from "@/lib/priority";
import { buttonCls, Field, ghostButtonCls, inputCls } from "../ui";
import { acceptAssignmentAction, declineAssignmentAction } from "../planung-actions";

export { PRIORITY_LABEL };

export const STATUS_LABEL = { OPEN: "Offen", IN_PROGRESS: "In Bearbeitung", DONE: "Erledigt" } as const;

export interface TaskValues {
  title: string;
  description: string | null;
  dueDate: Date | null;
  dueTime: string | null;
  priority: Priority;
  showOnDashboard: boolean;
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
          <select className={inputCls} name="priority" defaultValue={t?.priority ?? DEFAULT_PRIORITY}>
            {PRIORITIES.map((k) => (
              <option key={k} value={k}>{PRIORITY_LABEL[k]}</option>
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
      <label className="mb-4 flex min-h-11 items-center gap-3 text-sm font-medium">
        <input type="checkbox" name="showOnDashboard" className="h-5 w-5" defaultChecked={t?.showOnDashboard ?? false} />
        Im Kalender auf der Startseite anzeigen
      </label>
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

/** Priority name as a coloured badge (the name is always visible, colour is only a second signal). */
export function PriorityBadge({ p }: { p: Priority }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${PRIORITY_BADGE[p]}`} data-testid="priority-badge" data-priority={p}>
      {PRIORITY_LABEL[p]}
    </span>
  );
}

/** Accept or decline a new assignment (issue 16); both buttons are full touch targets. */
export function AcceptDecline({ taskId, title, back }: { taskId: string; title: string; back?: "aufgabe" }) {
  return (
    <div className="flex w-full gap-2" data-testid="accept-decline">
      <form action={acceptAssignmentAction} className="flex-1">
        <input type="hidden" name="taskId" value={taskId} />
        {back ? <input type="hidden" name="zurueck" value={back} /> : null}
        <button className={`${buttonCls} w-full`} aria-label={`„${title}“ annehmen`}>Annehmen</button>
      </form>
      <form action={declineAssignmentAction} className="flex-1">
        <input type="hidden" name="taskId" value={taskId} />
        {back ? <input type="hidden" name="zurueck" value={back} /> : null}
        <button className={`${ghostButtonCls} w-full`} aria-label={`„${title}“ ablehnen`}>Ablehnen</button>
      </form>
    </div>
  );
}
