import Link from "next/link";
import { notFound } from "next/navigation";
import { errorMessages, okMessages, one } from "@/lib/messages";
import { NotFoundError } from "@/server/errors";
import { getDashboard } from "@/server/services/dashboard";
import { getTask } from "@/server/services/tasks";
import { requireFamily } from "@/server/session";
import { archiveTaskAction, deleteTaskAction, updateTaskAction } from "../../planung-actions";
import { buttonCls, Card, ghostButtonCls, Notice } from "../../ui";
import { TaskFields } from "../task-fields";

export const dynamic = "force-dynamic";

export default async function AufgabeBearbeiten({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { user, familyId } = await requireFamily();
  const { id } = await params;
  const sp = await searchParams;
  const fehler = one(sp.fehler);
  const ok = one(sp.ok);
  const [dash, task] = await Promise.all([
    getDashboard(user.id, familyId),
    getTask(user.id, familyId, id).catch((e) => {
      if (e instanceof NotFoundError) return null;
      throw e;
    }),
  ]);
  if (!task) notFound();
  const archived = task.archivedAt !== null;

  return (
    <div className="space-y-6">
      <p>
        <Link href="/aufgaben" className="inline-flex min-h-11 items-center text-sm underline">← Zurück zu den Aufgaben</Link>
      </p>
      <h1 className="text-2xl font-bold">Aufgabe bearbeiten</h1>
      {fehler ? <Notice kind="error">{errorMessages[fehler] ?? "Das hat nicht geklappt."}</Notice> : null}
      {ok ? <Notice kind="ok">{okMessages[ok] ?? "Gespeichert."}</Notice> : null}
      {archived ? <Notice kind="ok">Diese Aufgabe ist archiviert und erscheint nicht mehr in den Listen und auf der Startseite.</Notice> : null}

      <Card>
        <form action={updateTaskAction}>
          <input type="hidden" name="taskId" value={task.id} />
          <TaskFields
            profiles={dash.profiles}
            t={{
              title: task.title,
              description: task.description,
              dueDate: task.dueDate,
              dueTime: task.dueTime,
              priority: task.priority,
              showOnDashboard: task.showOnDashboard,
              status: task.status,
              assigneeIds: task.assignments.map((a) => a.profileId),
            }}
          />
          <button className={buttonCls}>Änderungen speichern</button>
        </form>
        <p className="mt-4 text-xs text-stone-600">
          Angelegt {task.createdAt.toLocaleDateString("de-DE", { timeZone: dash.timezone })}
          {task.doneAt ? `, erledigt ${task.doneAt.toLocaleDateString("de-DE", { timeZone: dash.timezone })}` : ""}.
        </p>
      </Card>

      <Card title="Archivieren oder löschen">
        <form action={archiveTaskAction} className="mb-4">
          <input type="hidden" name="taskId" value={task.id} />
          <input type="hidden" name="archived" value={archived ? "0" : "1"} />
          <p className="mb-2 text-sm text-stone-700">
            {archived ? "Die Aufgabe kommt wieder in die Listen." : "Archivieren behält die Aufgabe, nimmt sie aber aus den Listen und von der Startseite."}
          </p>
          <button className={ghostButtonCls}>{archived ? "Aus dem Archiv holen" : "Archivieren"}</button>
        </form>
        <details className="rounded-xl border border-red-200 bg-red-50 p-3">
          <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium text-red-800">Endgültig löschen …</summary>
          <form action={deleteTaskAction} className="mt-2">
            <input type="hidden" name="taskId" value={task.id} />
            <p className="mb-3 text-sm text-red-900">„{task.title}“ wird unwiderruflich gelöscht. Das lässt sich nicht rückgängig machen.</p>
            <button className="inline-flex min-h-11 items-center rounded-xl bg-red-700 px-4 py-2 font-medium text-white hover:bg-red-800">Ja, endgültig löschen</button>
          </form>
        </details>
      </Card>
    </div>
  );
}
