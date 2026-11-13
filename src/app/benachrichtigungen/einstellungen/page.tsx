import Link from "next/link";
import { errorMessages, okMessages, one } from "@/lib/messages";
import { requireFamily } from "@/server/session";
import { getFeedInfo, getPrefs, type PrefKey } from "@/server/services/notifications";
import { revokeFeedAction, savePrefsAction } from "../../benachrichtigung-actions";
import { buttonCls, Card, ghostButtonCls, Notice } from "../../ui";
import { FeedCreate } from "./feed";

export const dynamic = "force-dynamic";

const LABELS: { key: PrefKey; label: string; hint: string }[] = [
  { key: "tasks", label: "Fällige Aufgaben", hint: "Aufgaben, die dir zugewiesen und heute fällig oder überfällig sind." },
  { key: "routines", label: "Routinen", hint: "Deine Routinen für heute." },
  { key: "birthdays", label: "Geburtstage", hint: "Am Vortag und am Tag selbst." },
  { key: "assignments", label: "Neue Zuweisungen", hint: "Wenn dir jemand anderes eine Aufgabe zuweist." },
  { key: "emailDigest", label: "Tägliche E-Mail-Zusammenfassung", hint: "Einmal am Morgen, nur wenn es etwas Neues gibt. Funktioniert nur, wenn der Betreiber sie eingerichtet hat." },
];

const fmt = (d: Date) => d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" });

export default async function Einstellungen({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { user, familyId } = await requireFamily();
  const sp = await searchParams;
  const fehler = one(sp.fehler);
  const ok = one(sp.ok);
  const [prefs, feed] = await Promise.all([getPrefs(user.id, familyId), getFeedInfo(user.id, familyId)]);
  return (
    <div className="max-w-xl space-y-5">
      <Link href="/benachrichtigungen" className="inline-flex min-h-11 items-center text-sm underline">Zurück zu den Benachrichtigungen</Link>
      <h1 className="text-2xl font-bold">Benachrichtigungen einstellen</h1>
      {fehler ? <Notice kind="error">{errorMessages[fehler] ?? "Das hat nicht geklappt."}</Notice> : null}
      {ok ? <Notice kind="ok">{okMessages[ok] ?? "Gespeichert."}</Notice> : null}
      <Card title="Worüber du benachrichtigt wirst">
        <p className="mb-3 text-sm text-stone-600">Gilt nur für dich und nur in dieser Familie.</p>
        <form action={savePrefsAction} className="space-y-3">
          {LABELS.map((l) => (
            <label key={l.key} className="flex min-h-11 items-start gap-3">
              <input type="checkbox" name={l.key} defaultChecked={prefs[l.key]} className="mt-1 h-5 w-5 shrink-0 accent-terracotta" />
              <span>
                <span className="block font-medium">{l.label}</span>
                <span className="block text-sm text-stone-600">{l.hint}</span>
              </span>
            </label>
          ))}
          <button className={buttonCls}>Speichern</button>
        </form>
      </Card>
      <Card title="Kalender abonnieren">
        <p className="mb-3 text-sm text-stone-600">
          Ein privater Link zum Abonnieren der Familientermine und Geburtstage in einer anderen Kalender-App (nur lesen, 30 Tage zurück und ein Jahr voraus). Eingebundene fremde Kalender sind nicht enthalten.
        </p>
        {feed ? (
          <p className="mb-3 text-sm" data-testid="feed-status">
            Link aktiv seit {fmt(feed.createdAt)}
            {feed.lastUsedAt ? `, zuletzt abgerufen am ${fmt(feed.lastUsedAt)}` : ", noch nie abgerufen"}.
          </p>
        ) : null}
        <FeedCreate exists={Boolean(feed)} />
        {feed ? (
          <form action={revokeFeedAction} className="mt-3">
            <button className={ghostButtonCls}>Link widerrufen</button>
          </form>
        ) : null}
      </Card>
    </div>
  );
}
