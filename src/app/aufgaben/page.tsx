import Link from "next/link";
import { errorMessages, okMessages, one } from "@/lib/messages";
import { todayIn } from "@/lib/week";
import { getDashboard } from "@/server/services/dashboard";
import { findTasks, TASK_FILTERS, type TaskFilter } from "@/server/services/tasks";
import { requireFamily } from "@/server/session";
import { createTaskAction, toggleTaskAction } from "../planung-actions";
import { SubTabs } from "../sub-tabs";
import { Dots, names } from "../people";
import { buttonCls, Card, ghostButtonCls, inputCls, Notice } from "../ui";
import { PRIORITY_EDGE } from "@/lib/priority";
import { AcceptDecline, PriorityBadge, STATUS_LABEL, TaskFields } from "./task-fields";

export const dynamic = "force-dynamic";

const fmt = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
// Filters of the list tab. "meine" (default) shows the own tasks and below them the unassigned ones.
const TABS: { key: TaskFilter; label: string }[] = [
  { key: "meine", label: "Meine" },
  { key: "alle", label: "Alle" },
  { key: "erledigt", label: "Erledigt" },
  { key: "archiv", label: "Archiv" },
];
const PAGE_TABS = [
  { key: "neu", label: "Neu" },
  { key: "aufgaben", label: "Aufgaben" },
] as const;
type PageTab = (typeof PAGE_TABS)[number]["key"];

export default async function Aufgaben({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { user, familyId } = await requireFamily();
  const sp = await searchParams;
  const fehler = one(sp.fehler);
  const ok = one(sp.ok);
  const asked = one(sp.filter);
  const tab: PageTab = one(sp.tab) === "neu" ? "neu" : "aufgaben";
  const filter: TaskFilter = (TASK_FILTERS as readonly string[]).includes(asked ?? "") ? (asked as TaskFilter) : "meine";
  const dash = await getDashboard(user.id, familyId);
  const person = dash.profiles.some((p) => p.id === one(sp.person)) ? one(sp.person) : undefined;
  const von = DATE.test(one(sp.von) ?? "") ? one(sp.von) : undefined;
  const bis = DATE.test(one(sp.bis) ?? "") ? one(sp.bis) : undefined;
  const query = { profileId: person, from: von, to: bis };
  const [tasks, unassigned] = await Promise.all([
    findTasks(user.id, familyId, { filter, ...query }),
    filter === "meine" && !person ? findTasks(user.id, familyId, { filter: "unzugewiesen", from: von, to: bis }) : Promise.resolve([]),
  ]);
  const me = dash.myProfileId;
  const today = todayIn(dash.timezone);
  const filtered = Boolean(person || von || bis);
  const open = tasks.filter((t) => t.status !== "DONE");
  const done = tasks.filter((t) => t.status === "DONE");
  const tabHref = (k: TaskFilter) => {
    const q = new URLSearchParams();
    if (k !== "meine") q.set("filter", k);
    if (person) q.set("person", person);
    if (von) q.set("von", von);
    if (bis) q.set("bis", bis);
    const s = q.toString();
    return s ? `/aufgaben?${s}` : "/aufgaben";
  };

  const row = (t: (typeof tasks)[number]) => {
    const due = t.dueDate ? t.dueDate.toISOString().slice(0, 10) : null;
    const ids = t.assignments.map((a) => a.profileId);
    const isDone = t.status === "DONE";
    const late = !isDone && !t.archivedAt && due !== null && due < today;
    const pending = !t.archivedAt && t.assignments.some((a) => a.profileId === me && a.state === "PENDING");
    return (
      <li key={t.id} className={`flex flex-wrap items-center gap-3 border-l-4 py-3 pl-3 ${PRIORITY_EDGE[t.priority]}`} data-testid="task-row" data-priority={t.priority} data-pending={pending ? "true" : undefined}>
        {t.archivedAt ? null : (
          <form action={toggleTaskAction}>
            <input type="hidden" name="taskId" value={t.id} />
            <input type="hidden" name="done" value={isDone ? "0" : "1"} />
            <input type="hidden" name="liste" value={tabHref(filter)} />
            <button className={ghostButtonCls} aria-label={isDone ? `„${t.title}“ wieder öffnen` : `„${t.title}“ abhaken`}>
              {isDone ? "Wieder öffnen" : "Abhaken"}
            </button>
          </form>
        )}
        <span className="min-w-0 flex-1">
          {pending ? <span className="mb-0.5 inline-flex rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-terracotta-dark" data-testid="pending-badge">Neu zugewiesen</span> : null}
          <span className={`block break-words font-medium ${isDone ? "text-stone-500 line-through" : ""}`}>{t.title}</span>
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-stone-600">
            <Dots profiles={dash.profiles} ids={ids} />
            {ids.length ? names(dash.profiles, ids) : "Niemand zugewiesen"}
            {due ? (
              <span className={late ? "font-medium text-red-700" : ""}>
                · fällig {fmt(due)}{t.dueTime ? `, ${t.dueTime} Uhr` : ""}{late ? " (überfällig)" : ""}
              </span>
            ) : null}
            <span className="sr-only">Priorität:</span>
            <PriorityBadge p={t.priority} />
            {t.showOnDashboard ? <span>· auf der Startseite</span> : null}
            {t.status === "IN_PROGRESS" ? <span>· {STATUS_LABEL.IN_PROGRESS}</span> : null}
          </span>
        </span>
        <Link href={`/aufgaben/${t.id}`} className="inline-flex min-h-11 items-center px-3 text-sm text-stone-700 underline" aria-label={`„${t.title}“ bearbeiten`}>
          Bearbeiten
        </Link>
        {pending ? <AcceptDecline taskId={t.id} title={t.title} /> : null}
      </li>
    );
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Aufgaben</h1>
      <SubTabs label="Aufgaben" base="/aufgaben" tabs={PAGE_TABS} active={tab} testId="task-tabs" />
      {fehler ? <Notice kind="error">{errorMessages[fehler] ?? "Das hat nicht geklappt."}</Notice> : null}
      {ok ? <Notice kind="ok">{okMessages[ok] ?? "Gespeichert."}</Notice> : null}

      {tab === "neu" ? (
        <Card title="Neue Aufgabe">
          <form action={createTaskAction}>
            <TaskFields profiles={dash.profiles} />
            <button className={buttonCls}>Aufgabe anlegen</button>
          </form>
          <p className="mt-3 text-xs text-stone-600">Wer einer anderen Person zugewiesen wird, kann die Aufgabe annehmen oder ablehnen.</p>
        </Card>
      ) : (
      <>
      <nav aria-label="Aufgaben filtern" className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={tabHref(t.key)}
            aria-current={filter === t.key ? "page" : undefined}
            className={`inline-flex min-h-11 items-center rounded-full px-4 text-sm font-medium ring-1 ${
              filter === t.key ? "bg-terracotta text-white ring-terracotta" : "bg-white text-stone-700 ring-stone-300"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      <details open={filtered} className="rounded-2xl bg-white p-4 ring-1 ring-stone-200">
        <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium">Nach Person und Zeitraum eingrenzen{filtered ? " (aktiv)" : ""}</summary>
        <form method="get" action="/aufgaben" className="mt-2 grid gap-3 sm:grid-cols-4">
          {filter !== "meine" ? <input type="hidden" name="filter" value={filter} /> : null}
          <div className="text-sm">
            <label htmlFor="f-person" className="mb-1 block font-medium">Person</label>
            <select id="f-person" className={inputCls} name="person" defaultValue={person ?? ""}>
              <option value="">Alle</option>
              {dash.profiles.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div className="text-sm">
            <label htmlFor="f-von" className="mb-1 block font-medium">Fällig ab</label>
            <input id="f-von" className={inputCls} type="date" name="von" defaultValue={von ?? ""} />
          </div>
          <div className="text-sm">
            <label htmlFor="f-bis" className="mb-1 block font-medium">Fällig bis</label>
            <input id="f-bis" className={inputCls} type="date" name="bis" defaultValue={bis ?? ""} />
          </div>
          <div className="flex items-end gap-2">
            <button className={ghostButtonCls}>Anwenden</button>
            {filtered ? <Link href={filter !== "meine" ? `/aufgaben?filter=${filter}` : "/aufgaben"} className="inline-flex min-h-11 items-center text-sm underline">Zurücksetzen</Link> : null}
          </div>
        </form>
      </details>

      {filter === "meine" ? (
        <>
          <Card title={`Meine (${tasks.length})`}>
            {tasks.length === 0 ? <p className="text-stone-600">{filtered ? "Keine Aufgaben für diese Auswahl." : "Nichts offen für dich."}</p> : <ul className="divide-y divide-stone-100">{tasks.map(row)}</ul>}
          </Card>
          {!person ? (
            <Card title={`Nicht zugewiesen (${unassigned.length})`}>
              {unassigned.length === 0 ? <p className="text-stone-600">Jede offene Aufgabe hat jemanden.</p> : <ul className="divide-y divide-stone-100">{unassigned.map(row)}</ul>}
            </Card>
          ) : null}
        </>
      ) : filter === "alle" ? (
        <>
          <Card title={`Offen (${open.length})`}>
            {open.length === 0 ? <p className="text-stone-600">{filtered ? "Keine Aufgaben für diese Auswahl." : "Alles erledigt."}</p> : <ul className="divide-y divide-stone-100">{open.map(row)}</ul>}
          </Card>
          {done.length ? (
            <Card title="Zuletzt erledigt">
              <ul className="divide-y divide-stone-100">{done.slice(-20).reverse().map(row)}</ul>
            </Card>
          ) : null}
        </>
      ) : (
        <Card title={`${TABS.find((t) => t.key === filter)?.label ?? "Aufgaben"} (${tasks.length})`}>
          {tasks.length === 0 ? (
            <p className="text-stone-600">
              {filter === "unzugewiesen" ? "Jede offene Aufgabe hat jemanden." : filter === "archiv" ? "Noch nichts archiviert." : "Keine Aufgaben für diese Auswahl."}
            </p>
          ) : (
            <ul className="divide-y divide-stone-100">{tasks.map(row)}</ul>
          )}
        </Card>
      )}
      </>
      )}
    </div>
  );
}

