import Link from "next/link";
import { notFound } from "next/navigation";
import { errorMessages, okMessages, one } from "@/lib/messages";
import { WASTE_INFO_URL } from "@/lib/modules";
import { NotFoundError } from "@/server/errors";
import { getWaste, type WasteView } from "@/server/services/modules";
import { requireFamily } from "@/server/session";
import { setWasteCalendarAction } from "../../module-actions";
import { buttonCls, Card, inputCls, Notice } from "../../ui";

export const dynamic = "force-dynamic";

const STATUS: Record<string, string> = {
  error: "Der letzte Abruf des Kalenders hat nicht geklappt. Angezeigt werden die zuletzt gespeicherten Termine.",
  never: "Der Kalender wurde noch nicht abgerufen. Das passiert beim nächsten Öffnen von Startseite oder Kalender.",
  off: "Der Kalender ist ausgeblendet. Einblenden unter „Externe Kalender“.",
};

const dayFmt = new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", timeZone: "UTC" });

/** Optional module "Abfallkalender": next pickups from one of the family's ICS calendars (docs/module.md). */
export default async function Abfall({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { user, familyId } = await requireFamily();
  const sp = await searchParams;
  const fehler = one(sp.fehler);
  const ok = one(sp.ok);
  let v: WasteView;
  try {
    v = await getWaste(user.id, familyId);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
  return (
    <div className="space-y-5">
      <Link href="/kalender" className="text-sm text-terracotta-dark underline">← Kalender</Link>
      <h1 className="text-2xl font-bold">Abfallkalender</h1>
      {fehler ? <Notice kind="error">{errorMessages[fehler] ?? "Das hat nicht geklappt."}</Notice> : null}
      {ok ? <Notice kind="ok">{okMessages[ok] ?? "Gespeichert."}</Notice> : null}
      {v.calendar && v.calendar.status !== "ok" ? <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200" data-testid="waste-notice">{STATUS[v.calendar.status]}</p> : null}
      <Card title="Nächste Abfuhrtermine">
        {!v.calendar ? (
          <p className="text-sm text-stone-600" data-testid="waste-notice">Noch kein Abfallkalender gewählt.{v.canManage ? " Wähle unten einen deiner Kalender." : " Ein Admin der Familie kann ihn wählen."}</p>
        ) : v.pickups.length === 0 ? (
          <p className="text-sm text-stone-600">Keine kommenden Abfuhrtermine im Kalender „{v.calendar.name}“.</p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {v.pickups.map((p) => (
              <li key={p.id} className="flex items-center gap-3 py-2" data-testid="pickup">
                <span className="w-24 shrink-0 text-sm text-stone-600">{dayFmt.format(new Date(p.date))}</span>
                <span className="min-w-0 break-words font-medium">{p.title}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="Woher kommen die Termine?">
        <p className="mb-2 text-sm text-stone-600">
          Eine dokumentierte Schnittstelle der FES haben wir nicht gefunden. Bietet die FES (oder ihre App) die Termine als Kalenderdatei
          oder Kalender-Adresse an, trage sie unter „Externe Kalender“ ein und wähle den Kalender danach hier aus.
        </p>
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <a href={WASTE_INFO_URL} target="_blank" rel="noopener noreferrer nofollow" className="text-terracotta-dark underline">Seite der FES öffnen ↗</a>
          <Link href="/kalender/quellen" className="text-terracotta-dark underline">Externe Kalender verwalten</Link>
        </p>
        {v.canManage ? (
          <form action={setWasteCalendarAction} className="mt-4 space-y-2">
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Abfallkalender</span>
              <select name="calendarId" defaultValue={v.calendar?.id ?? ""} className={inputCls}>
                <option value="">Keiner</option>
                {v.calendars.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>
            <button className={buttonCls}>Speichern</button>
          </form>
        ) : null}
      </Card>
    </div>
  );
}
