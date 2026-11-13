import { errorMessages, okMessages, one } from "@/lib/messages";
import { todayIn } from "@/lib/week";
import { getDashboard } from "@/server/services/dashboard";
import { listTasks } from "@/server/services/tasks";
import { requireFamily } from "@/server/session";
import { createTaskAction, deleteTaskAction, toggleTaskAction } from "../planung-actions";
import { Dots, names } from "../people";
import { buttonCls, Card, Field, ghostButtonCls, inputCls, Notice } from "../ui";

export const dynamic = "force-dynamic";

const fmt = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;

export default async function Aufgaben({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { user, familyId } = await requireFamily();
  const sp = await searchParams;
  const fehler = one(sp.fehler);
  const ok = one(sp.ok);
  const [dash, tasks] = await Promise.all([getDashboard(user.id, familyId), listTasks(user.id, familyId)]);
  const today = todayIn(dash.timezone);
  const open = tasks.filter((t) => t.status === "OPEN");
  const done = tasks.filter((t) => t.status === "DONE").slice(-20).reverse();
  const row = (t: (typeof tasks)[number]) => {
    const due = t.dueDate ? t.dueDate.toISOString().slice(0, 10) : null;
    const ids = t.assignments.map((a) => a.profileId);
    const isDone = t.status === "DONE";
    return (
      <li key={t.id} className="flex flex-wrap items-center gap-3 py-3" data-testid="task-row">
        <form action={toggleTaskAction}>
          <input type="hidden" name="taskId" value={t.id} />
          <input type="hidden" name="done" value={isDone ? "0" : "1"} />
          <button className={ghostButtonCls} aria-label={isDone ? `„${t.title}“ wieder öffnen` : `„${t.title}“ abhaken`}>
            {isDone ? "Wieder öffnen" : "Abhaken"}
          </button>
        </form>
        <span className="min-w-0 flex-1">
          <span className={`block break-words font-medium ${isDone ? "text-stone-500 line-through" : ""}`}>{t.title}</span>
          <span className="flex flex-wrap items-center gap-2 text-sm text-stone-600">
            <Dots profiles={dash.profiles} ids={ids} />
            {ids.length ? names(dash.profiles, ids) : "Niemand zugewiesen"}
            {due ? (
              <span className={!isDone && due < today ? "font-medium text-red-700" : ""}>
                · fällig {fmt(due)}{!isDone && due < today ? " (überfällig)" : ""}
              </span>
            ) : null}
          </span>
        </span>
        <form action={deleteTaskAction}>
          <input type="hidden" name="taskId" value={t.id} />
          <button className="min-h-11 px-3 text-sm text-stone-600 underline" aria-label={`„${t.title}“ löschen`}>Löschen</button>
        </form>
      </li>
    );
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Aufgaben</h1>
      {fehler ? <Notice kind="error">{errorMessages[fehler] ?? "Das hat nicht geklappt."}</Notice> : null}
      {ok ? <Notice kind="ok">{okMessages[ok] ?? "Gespeichert."}</Notice> : null}

      <Card title="Neue Aufgabe">
        <form action={createTaskAction}>
          <Field label="Was ist zu tun?">
            <input className={inputCls} name="title" maxLength={200} required />
          </Field>
          <Field label="Fällig am (optional)">
            <input className={inputCls} type="date" name="dueDate" />
          </Field>
          <fieldset className="mb-4">
            <legend className="mb-1 text-sm font-medium">Zuständig (keiner, eine oder mehrere Personen)</legend>
            <div className="flex flex-wrap gap-2">
              {dash.profiles.map((p) => (
                <label key={p.id} className="flex min-h-11 items-center gap-2 rounded-xl border border-stone-300 bg-white px-3">
                  <input type="checkbox" name="assigneeIds" value={p.id} className="h-5 w-5" />
                  <Dots profiles={dash.profiles} ids={[p.id]} />
                  {p.name}
                </label>
              ))}
            </div>
          </fieldset>
          <button className={buttonCls}>Aufgabe anlegen</button>
        </form>
      </Card>

      <Card title={`Offen (${open.length})`}>
        {open.length === 0 ? <p className="text-stone-600">Alles erledigt.</p> : <ul className="divide-y divide-stone-100">{open.map(row)}</ul>}
      </Card>
      {done.length ? (
        <Card title="Zuletzt erledigt">
          <ul className="divide-y divide-stone-100">{done.map(row)}</ul>
        </Card>
      ) : null}
    </div>
  );
}
