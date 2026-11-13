import Link from "next/link";
import { notFound } from "next/navigation";
import { errorMessages, okMessages, one } from "@/lib/messages";
import { addDays } from "@/lib/week";
import { NotFoundError } from "@/server/errors";
import { getDashboard } from "@/server/services/dashboard";
import { getRoutine, listOccurrences } from "@/server/services/routines";
import { requireFamily } from "@/server/session";
import { routineStatusAction, updateRoutineAction } from "../../planung-actions";
import { buttonCls, Card, ghostButtonCls, Notice } from "../../ui";
import { RoutineFields } from "../form";
import { OccurrenceRow } from "../occurrences";

export const dynamic = "force-dynamic";

export default async function RoutineBearbeiten({
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
  const dash = await getDashboard(user.id, familyId);
  const routine = await getRoutine(user.id, familyId, id).catch((e) => {
    if (e instanceof NotFoundError) return null;
    throw e;
  });
  if (!routine) notFound();
  const occurrences = (await listOccurrences(user.id, familyId, dash.today, addDays(dash.today, 27))).filter((o) => o.routineId === routine.id);
  const back = `/routinen/${routine.id}`;

  return (
    <div className="space-y-6">
      <p>
        <Link href="/routinen" className="inline-flex min-h-11 items-center text-sm underline">← Zurück zu den Routinen</Link>
      </p>
      <h1 className="text-2xl font-bold">Routine bearbeiten</h1>
      {fehler ? <Notice kind="error">{errorMessages[fehler] ?? "Das hat nicht geklappt."}</Notice> : null}
      {ok ? <Notice kind="ok">{okMessages[ok] ?? "Gespeichert."}</Notice> : null}
      {routine.status !== "ACTIVE" ? (
        <Notice kind="ok">Diese Routine ist {routine.status === "PAUSED" ? "pausiert" : "archiviert"}; es entstehen keine neuen Termine.</Notice>
      ) : null}

      <Card>
        <form action={updateRoutineAction}>
          <input type="hidden" name="routineId" value={routine.id} />
          <RoutineFields
            profiles={dash.profiles}
            v={{
              title: routine.title,
              description: routine.description,
              freq: routine.freq,
              interval: routine.interval,
              weekdays: routine.weekdays,
              monthDay: routine.monthDay,
              startDate: routine.startDate.toISOString().slice(0, 10),
              endDate: routine.endDate ? routine.endDate.toISOString().slice(0, 10) : null,
              timeOfDay: routine.timeOfDay,
              assignMode: routine.assignMode,
              assigneeIds: routine.assignments.map((a) => a.profileId),
            }}
          />
          <button className={buttonCls}>Änderungen speichern</button>
          <p className="mt-3 text-xs text-stone-600">
            Erledigte, übersprungene und einzeln zugewiesene Termine bleiben unverändert; alle übrigen künftigen Termine werden neu berechnet.
          </p>
        </form>
      </Card>

      <Card title="Termine der nächsten 4 Wochen">
        {occurrences.length === 0 ? (
          <p className="text-stone-600">Keine Termine in diesem Zeitraum.</p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {occurrences.map((o) => (
              <OccurrenceRow key={o.id} o={o} profiles={dash.profiles} back={back} today={dash.today} />
            ))}
          </ul>
        )}
      </Card>

      <Card title="Pausieren oder archivieren">
        <div className="flex flex-wrap gap-2">
          <form action={routineStatusAction}>
            <input type="hidden" name="routineId" value={routine.id} />
            <input type="hidden" name="status" value={routine.status === "ACTIVE" ? "PAUSED" : "ACTIVE"} />
            <button className={ghostButtonCls}>{routine.status === "ACTIVE" ? "Pausieren" : "Fortsetzen"}</button>
          </form>
          {routine.status !== "ARCHIVED" ? (
            <form action={routineStatusAction}>
              <input type="hidden" name="routineId" value={routine.id} />
              <input type="hidden" name="status" value="ARCHIVED" />
              <button className={ghostButtonCls}>Archivieren</button>
            </form>
          ) : null}
        </div>
        <p className="mt-3 text-xs text-stone-600">Erledigte Termine bleiben erhalten. Offene künftige Termine werden beim Pausieren entfernt.</p>
      </Card>
    </div>
  );
}
