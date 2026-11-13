import Link from "next/link";
import { notFound } from "next/navigation";
import { errorMessages, okMessages, one } from "@/lib/messages";
import { NotFoundError } from "@/server/errors";
import { getEvent } from "@/server/services/calendar";
import { getDashboard } from "@/server/services/dashboard";
import { requireFamily } from "@/server/session";
import { deleteEventAction, updateEventAction } from "../../../kalender-actions";
import { buttonCls, Card, Notice } from "../../../ui";
import { EventFields } from "../../form";

export const dynamic = "force-dynamic";

export default async function TerminBearbeiten({
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
  const [dash, ev] = await Promise.all([
    getDashboard(user.id, familyId),
    getEvent(user.id, familyId, id).catch((e) => {
      if (e instanceof NotFoundError) return null;
      throw e;
    }),
  ]);
  if (!ev) notFound();
  return (
    <div className="space-y-6">
      <p>
        <Link href={`/kalender?datum=${ev.startDate}`} className="inline-flex min-h-11 items-center text-sm underline">← Zurück zum Kalender</Link>
      </p>
      <h1 className="text-2xl font-bold">Termin bearbeiten</h1>
      {fehler ? <Notice kind="error">{errorMessages[fehler] ?? "Das hat nicht geklappt."}</Notice> : null}
      {ok ? <Notice kind="ok">{okMessages[ok] ?? "Gespeichert."}</Notice> : null}
      <Card>
        <form action={updateEventAction}>
          <input type="hidden" name="eventId" value={ev.id} />
          <EventFields profiles={dash.profiles} v={ev} />
          {ev.freq ? <p className="mb-4 text-sm text-stone-700">Änderungen gelten für die ganze Serie.</p> : null}
          <button className={buttonCls}>Änderungen speichern</button>
        </form>
      </Card>
      <Card title="Löschen">
        <details className="rounded-xl border border-red-200 bg-red-50 p-3">
          <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium text-red-800">Endgültig löschen …</summary>
          <form action={deleteEventAction} className="mt-2">
            <input type="hidden" name="eventId" value={ev.id} />
            <p className="mb-3 text-sm text-red-900">„{ev.title}“ wird gelöscht{ev.freq ? ", mit allen Wiederholungen" : ""}. Das lässt sich nicht rückgängig machen.</p>
            <button className="inline-flex min-h-11 items-center justify-center rounded-xl bg-red-700 px-4 py-2 font-medium text-white hover:bg-red-800">Ja, Termin löschen</button>
          </form>
        </details>
      </Card>
    </div>
  );
}
