import Link from "next/link";
import { errorMessages, okMessages, one } from "@/lib/messages";
import { fetchErrorText } from "@/server/safe-fetch";
import { listCalendars, MAX_CALENDARS, type CalendarSummary } from "@/server/services/calendar";
import { getDashboard } from "@/server/services/dashboard";
import { requireFamily } from "@/server/session";
import {
  addSubscriptionAction, deleteCalendarAction, importFileAction, refreshCalendarAction, reimportFileAction, toggleCalendarAction, updateCalendarAction,
} from "../../kalender-actions";
import { buttonCls, Card, Field, ghostButtonCls, inputCls, Notice } from "../../ui";
import { CalendarBadge } from "../parts";

export const dynamic = "force-dynamic";

const COLORS = ["Blau", "Gelb", "Rosa", "Grün", "Violett", "Türkis", "Orange", "Grau"];

function ColorSelect({ value }: { value: number }) {
  return (
    <select className={inputCls} name="colorIndex" defaultValue={value}>
      {COLORS.map((n, i) => <option key={n} value={i}>{n}</option>)}
    </select>
  );
}

function when(d: Date | null, tz: string): string {
  if (!d) return "noch nie";
  const p = new Intl.DateTimeFormat("de-DE", { timeZone: tz, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(d);
  return `${p.replace(",", "")} Uhr`;
}

function CalendarRow({ c, tz }: { c: CalendarSummary; tz: string }) {
  const error = fetchErrorText(c.lastError);
  const sub = c.kind === "SUBSCRIPTION";
  return (
    <li className="py-4" data-testid="calendar-row">
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 flex-1 break-words font-medium">{c.name}</span>
        <CalendarBadge name={sub ? "Abo" : "Datei"} colorIndex={c.colorIndex} />
        {!c.enabled ? <span className="rounded-full bg-stone-200 px-2 py-0.5 text-xs">ausgeblendet</span> : null}
      </div>
      <p className="mt-1 text-sm text-stone-600">
        {c.eventCount} Termine{c.truncated ? " (gekürzt: sehr viele Wiederholungen)" : ""} · {sub ? "Letzter erfolgreicher Abruf" : "Eingelesen"}: {when(c.lastSuccessAt, tz)}
      </p>
      {error ? <p role="alert" className="mt-1 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800 ring-1 ring-red-200">{error} Die bisherigen Termine bleiben sichtbar.</p> : null}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {sub ? (
          <form action={refreshCalendarAction}>
            <input type="hidden" name="calendarId" value={c.id} />
            <button className={ghostButtonCls}>Jetzt abrufen</button>
          </form>
        ) : null}
        <form action={toggleCalendarAction}>
          <input type="hidden" name="calendarId" value={c.id} />
          <input type="hidden" name="enabled" value={c.enabled ? "0" : "1"} />
          <button className={ghostButtonCls}>{c.enabled ? "Ausblenden" : "Einblenden"}</button>
        </form>
      </div>
      <details className="mt-1">
        <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm text-stone-700 underline">Name und Farbe</summary>
        <form action={updateCalendarAction} className="mt-2 grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="calendarId" value={c.id} />
          <Field label="Name"><input className={inputCls} name="name" maxLength={100} defaultValue={c.name} required /></Field>
          <Field label="Farbe"><ColorSelect value={c.colorIndex} /></Field>
          <div><button className={ghostButtonCls}>Speichern</button></div>
        </form>
      </details>
      {!sub ? (
        <details className="mt-1">
          <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm text-stone-700 underline">Neue Datei einlesen</summary>
          <form action={reimportFileAction} className="mt-2 space-y-3">
            <input type="hidden" name="calendarId" value={c.id} />
            <Field label="ICS-Datei (ersetzt die bisherigen Termine dieses Kalenders)">
              <input className={inputCls} type="file" name="datei" accept=".ics,text/calendar" required />
            </Field>
            <button className={ghostButtonCls}>Datei einlesen</button>
          </form>
        </details>
      ) : null}
      <details className="mt-1 rounded-xl border border-red-200 bg-red-50 p-3">
        <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium text-red-800">Löschen …</summary>
        <form action={deleteCalendarAction} className="mt-2">
          <input type="hidden" name="calendarId" value={c.id} />
          <p className="mb-3 text-sm text-red-900">„{c.name}“ und alle seine Termine werden hier gelöscht{sub ? " und die gespeicherte Adresse entfernt" : ""}. Der Kalender selbst beim Anbieter bleibt unberührt.</p>
          <button className="inline-flex min-h-11 items-center justify-center rounded-xl bg-red-700 px-4 py-2 font-medium text-white hover:bg-red-800">Ja, Kalender löschen</button>
        </form>
      </details>
    </li>
  );
}

export default async function Quellen({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { user, familyId } = await requireFamily();
  const sp = await searchParams;
  const fehler = one(sp.fehler);
  const ok = one(sp.ok);
  const [calendars, dash] = await Promise.all([listCalendars(user.id, familyId), getDashboard(user.id, familyId)]);
  const full = calendars.length >= MAX_CALENDARS;
  return (
    <div className="space-y-6">
      <p>
        <Link href="/kalender" className="inline-flex min-h-11 items-center text-sm underline">← Zurück zum Kalender</Link>
      </p>
      <h1 className="text-2xl font-bold">Externe Kalender</h1>
      {fehler ? <Notice kind="error">{errorMessages[fehler] ?? "Das hat nicht geklappt."}</Notice> : null}
      {ok ? <Notice kind="ok">{okMessages[ok] ?? "Gespeichert."}</Notice> : null}

      <Card title="Eure Kalender">
        {calendars.length === 0 ? (
          <p className="text-stone-600">Noch kein externer Kalender. Unten kannst du eine ICS-Datei hochladen oder einen Kalender abonnieren.</p>
        ) : (
          <ul className="divide-y divide-stone-100">{calendars.map((c) => <CalendarRow key={c.id} c={c} tz={dash.timezone} />)}</ul>
        )}
        <p className="mt-3 text-xs text-stone-600">
          Externe Termine sind nur lesbar und im Kalender als „Extern“ gekennzeichnet. Es werden Termine von etwa einem Monat zurück bis einem Jahr voraus gespeichert.
        </p>
      </Card>

      <Card title="ICS-Datei importieren">
        <p className="mb-3 text-sm text-stone-700">Einmaliger Import: die Datei wird gelesen und nicht erneut abgerufen. Höchstens 2 MB.</p>
        <form action={importFileAction}>
          <Field label="ICS-Datei"><input className={inputCls} type="file" name="datei" accept=".ics,text/calendar" required disabled={full} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name (leer = Dateiname)"><input className={inputCls} name="name" maxLength={100} /></Field>
            <Field label="Farbe"><ColorSelect value={1} /></Field>
          </div>
          <button className={buttonCls} disabled={full}>Importieren</button>
        </form>
      </Card>

      <Card title="Kalender abonnieren (ICS-Adresse)">
        <p className="mb-3 text-sm text-stone-700">
          Der Server ruft die Adresse regelmäßig ab (höchstens stündlich, oder mit „Jetzt abrufen“) und zeigt die Termine nur an. Die Adresse kann einen geheimen Zugangsschlüssel enthalten:
          sie wird verschlüsselt gespeichert und nie wieder angezeigt, auch dir nicht. Erlaubt ist nur https (oder webcal).
        </p>
        <form action={addSubscriptionAction}>
          <Field label="Adresse (https://… oder webcal://…)">
            <input className={inputCls} type="url" name="url" inputMode="url" autoComplete="off" spellCheck={false} maxLength={2000} required disabled={full} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name"><input className={inputCls} name="name" maxLength={100} required disabled={full} /></Field>
            <Field label="Farbe"><ColorSelect value={3} /></Field>
          </div>
          <button className={buttonCls} disabled={full}>Abonnieren</button>
        </form>
        {full ? <p className="mt-3 text-sm text-stone-700">Es sind {MAX_CALENDARS} Kalender angelegt, mehr geht nicht. Lösche zuerst einen.</p> : null}
        <p className="mt-3 text-xs text-stone-600">Die Anbindung per Google- oder Apple-Anmeldung gibt es noch nicht. Bis dahin hilft die geheime iCal-Adresse, die beide Anbieter in den Kalendereinstellungen anzeigen.</p>
      </Card>
    </div>
  );
}
