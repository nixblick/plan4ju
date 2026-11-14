import Link from "next/link";
import { notFound } from "next/navigation";
import { errorMessages, okMessages, one } from "@/lib/messages";
import { NotFoundError } from "@/server/errors";
import { getEvent, getEventInstance } from "@/server/services/calendar";
import { requireFamily } from "@/server/session";
import { eventInstanceAction } from "../../../../kalender-actions";
import { buttonCls, Card, ghostButtonCls, inputCls, Notice } from "../../../../ui";

export const dynamic = "force-dynamic";

const dmy = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;

/** One instance of a repeated event: move or cancel it without touching the series. */
export default async function TerminEinzeln({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; datum: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { user, familyId } = await requireFamily();
  const { id, datum } = await params;
  const sp = await searchParams;
  const fehler = one(sp.fehler);
  const ok = one(sp.ok);
  const [ev, inst] = await Promise.all([
    getEvent(user.id, familyId, id).catch((e) => {
      if (e instanceof NotFoundError) return null;
      throw e;
    }),
    getEventInstance(user.id, familyId, id, datum),
  ]);
  if (!ev || !inst) notFound();
  const when = inst.startTime ? `${dmy(inst.startDate)}, ${inst.startTime} Uhr` : dmy(inst.startDate);
  return (
    <div className="space-y-6">
      <p>
        <Link href={`/kalender?datum=${inst.startDate}`} className="inline-flex min-h-11 items-center text-sm underline">← Zurück zum Kalender</Link>
      </p>
      <h1 className="break-words text-2xl font-bold">{ev.title}</h1>
      {fehler ? <Notice kind="error">{errorMessages[fehler] ?? "Das hat nicht geklappt."}</Notice> : null}
      {ok ? <Notice kind="ok">{okMessages[ok] ?? "Gespeichert."}</Notice> : null}
      <Card title={`Termin am ${dmy(inst.date)}`}>
        <p className="mb-3 text-sm" data-testid="instance-state">
          {inst.cancelled ? "Abgesagt." : inst.moved ? `Verschoben auf ${when}.` : `Wie in der Serie: ${when}.`}
        </p>
        {inst.cancelled || inst.moved ? (
          <form action={eventInstanceAction} className="mb-4">
            <input type="hidden" name="eventId" value={ev.id} />
            <input type="hidden" name="date" value={inst.date} />
            <input type="hidden" name="mode" value="zuruecksetzen" />
            <button className={ghostButtonCls}>Wie in der Serie</button>
          </form>
        ) : null}
        <form action={eventInstanceAction} className="space-y-3">
          <input type="hidden" name="eventId" value={ev.id} />
          <input type="hidden" name="date" value={inst.date} />
          <input type="hidden" name="mode" value="verschieben" />
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              Neuer Tag
              <input type="date" name="startDate" required defaultValue={inst.startDate} className={inputCls} />
            </label>
            {ev.allDay ? (
              <label className="block text-sm">
                Bis
                <input type="date" name="endDate" defaultValue={inst.endDate} className={inputCls} />
              </label>
            ) : (
              <>
                <label className="block text-sm">
                  Beginn
                  <input type="time" name="startTime" required defaultValue={inst.startTime ?? ""} className={inputCls} />
                </label>
                <label className="block text-sm">
                  Ende
                  <input type="time" name="endTime" defaultValue={inst.endTime ?? ""} className={inputCls} />
                </label>
              </>
            )}
          </div>
          <button className={buttonCls}>Nur diesen Termin verschieben</button>
        </form>
        {!inst.cancelled ? (
          <form action={eventInstanceAction} className="mt-4">
            <input type="hidden" name="eventId" value={ev.id} />
            <input type="hidden" name="date" value={inst.date} />
            <input type="hidden" name="mode" value="absagen" />
            <button className="inline-flex min-h-11 items-center rounded-xl border border-red-300 px-4 text-sm font-medium text-red-800">Nur diesen Termin absagen</button>
          </form>
        ) : null}
      </Card>
      <p>
        <Link href={`/kalender/termin/${ev.id}`} className="inline-flex min-h-11 items-center text-sm underline">Ganze Serie bearbeiten</Link>
      </p>
    </div>
  );
}
