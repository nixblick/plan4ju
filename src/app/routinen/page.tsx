import Link from "next/link";
import { errorMessages, okMessages, one } from "@/lib/messages";
import { describeRule } from "@/lib/recurrence";
import { ROUTINE_TEMPLATES } from "@/lib/routine-templates";
import { addDays } from "@/lib/week";
import { getDashboard } from "@/server/services/dashboard";
import { listOccurrences, listRoutines, ruleOf } from "@/server/services/routines";
import { requireFamily } from "@/server/session";
import { routineStatusAction } from "../planung-actions";
import { names } from "../people";
import { buttonCls, Card, ghostButtonCls, Notice } from "../ui";
import { fmtDay, OccurrenceRow } from "./occurrences";

export const dynamic = "force-dynamic";

const MODE = { FIXED: "fest", ROTATING: "im Wechsel", PER_OCCURRENCE: "je Termin einzeln" } as const;
const STATUS = { ACTIVE: "Aktiv", PAUSED: "Pausiert", ARCHIVED: "Archiviert" } as const;

export default async function Routinen({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { user, familyId } = await requireFamily();
  const sp = await searchParams;
  const fehler = one(sp.fehler);
  const ok = one(sp.ok);
  const archiv = one(sp.archiv) === "1";
  const dash = await getDashboard(user.id, familyId);
  const [routines, upcoming] = await Promise.all([
    listRoutines(user.id, familyId, archiv),
    listOccurrences(user.id, familyId, dash.today, addDays(dash.today, 13)),
  ]);
  const byDay = new Map<string, typeof upcoming>();
  for (const o of upcoming) byDay.set(o.date, [...(byDay.get(o.date) ?? []), o]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Routinen</h1>
        <Link href="/routinen/neu" className={buttonCls}>Neue Routine</Link>
      </div>
      {fehler ? <Notice kind="error">{errorMessages[fehler] ?? "Das hat nicht geklappt."}</Notice> : null}
      {ok ? <Notice kind="ok">{okMessages[ok] ?? "Gespeichert."}</Notice> : null}

      <Card title="Nächste 14 Tage">
        {byDay.size === 0 ? (
          <p className="text-stone-600">Noch keine Routine-Termine. Lege eine Routine an, zum Beispiel aus einer Vorlage.</p>
        ) : (
          <div className="space-y-4">
            {[...byDay.entries()].map(([iso, list]) => (
              <section key={iso} aria-label={fmtDay(iso)}>
                <h3 className={`text-sm font-semibold ${iso === dash.today ? "text-terracotta-dark" : "text-stone-700"}`}>
                  {fmtDay(iso)}{iso === dash.today ? " (heute)" : ""}
                </h3>
                <ul className="divide-y divide-stone-100">
                  {list.map((o) => (
                    <OccurrenceRow key={o.id} o={o} profiles={dash.profiles} back="/routinen" today={dash.today} />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </Card>

      <Card title="Alle Routinen">
        {routines.length === 0 ? (
          <p className="text-stone-600">Noch keine Routinen.</p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {routines.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 py-3" data-testid="routine-row">
                <span className="min-w-0 flex-1">
                  <span className="block break-words font-medium">{r.title}</span>
                  <span className="block text-sm text-stone-600">
                    {describeRule(ruleOf(r))}{r.timeOfDay ? `, ${r.timeOfDay} Uhr` : ""} · {MODE[r.assignMode]}
                    {r.assignments.length ? `: ${names(dash.profiles, r.assignments.map((a) => a.profileId))}` : ""}
                    {r.status !== "ACTIVE" ? ` · ${STATUS[r.status]}` : ""}
                  </span>
                </span>
                <Link href={`/routinen/${r.id}`} className="inline-flex min-h-11 items-center px-3 text-sm underline" aria-label={`„${r.title}“ bearbeiten`}>Bearbeiten</Link>
                <form action={routineStatusAction}>
                  <input type="hidden" name="routineId" value={r.id} />
                  <input type="hidden" name="status" value={r.status === "ACTIVE" ? "PAUSED" : "ACTIVE"} />
                  <button className={ghostButtonCls} aria-label={r.status === "ACTIVE" ? `„${r.title}“ pausieren` : `„${r.title}“ fortsetzen`}>
                    {r.status === "ACTIVE" ? "Pausieren" : r.status === "PAUSED" ? "Fortsetzen" : "Wieder aktivieren"}
                  </button>
                </form>
                {r.status !== "ARCHIVED" ? (
                  <form action={routineStatusAction}>
                    <input type="hidden" name="routineId" value={r.id} />
                    <input type="hidden" name="status" value="ARCHIVED" />
                    <button className="min-h-11 px-3 text-sm text-stone-700 underline" aria-label={`„${r.title}“ archivieren`}>Archivieren</button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-sm">
          <Link href={archiv ? "/routinen" : "/routinen?archiv=1"} className="inline-flex min-h-11 items-center underline">
            {archiv ? "Archivierte ausblenden" : "Archivierte anzeigen"}
          </Link>
        </p>
      </Card>

      <Card title="Vorlagen">
        <p className="mb-3 text-sm text-stone-600">Eine Vorlage füllt das Formular vor. Du kannst alles ändern, bevor du speicherst.</p>
        <ul className="flex flex-wrap gap-2">
          {ROUTINE_TEMPLATES.map((t) => (
            <li key={t.key}>
              <Link href={`/routinen/neu?vorlage=${t.key}`} className={ghostButtonCls}>{t.title}</Link>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-stone-600">
          Termine werden bis zu 8 Wochen im Voraus angelegt und automatisch nachgefüllt; weiter zurückliegende Termine entstehen nicht rückwirkend.
        </p>
      </Card>
    </div>
  );
}
