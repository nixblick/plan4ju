import Link from "next/link";
import { errorMessages, okMessages, one } from "@/lib/messages";
import { describeRule } from "@/lib/recurrence";
import { ROUTINE_TEMPLATES, templateByKey } from "@/lib/routine-templates";
import { addDays } from "@/lib/week";
import { getDashboard } from "@/server/services/dashboard";
import { listOccurrences, listRoutines, ruleOf } from "@/server/services/routines";
import { requireFamily } from "@/server/session";
import { createRoutineAction, routineStatusAction } from "../planung-actions";
import { names } from "../people";
import { buttonCls, Card, ghostButtonCls, Notice } from "../ui";
import { RoutineFields } from "./form";
import { SubTabs } from "../sub-tabs";
import { fmtDay, OccurrenceRow } from "./occurrences";

export const dynamic = "force-dynamic";

const MODE = { FIXED: "fest", ROTATING: "im Wechsel", PER_OCCURRENCE: "je Termin einzeln" } as const;
const STATUS = { ACTIVE: "Aktiv", PAUSED: "Pausiert", ARCHIVED: "Archiviert" } as const;

const TABS = [
  { key: "neu", label: "Neu" },
  { key: "alle", label: "Alle Routinen" },
  { key: "woche", label: "Meine 7 Tage" },
] as const;
type Tab = (typeof TABS)[number]["key"];

export default async function Routinen({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { user, familyId } = await requireFamily();
  const sp = await searchParams;
  const fehler = one(sp.fehler);
  const ok = one(sp.ok);
  const asked = one(sp.tab);
  const tab: Tab = TABS.some((t) => t.key === asked) ? (asked as Tab) : "woche";
  const archiv = one(sp.archiv) === "1";
  const dash = await getDashboard(user.id, familyId);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Routinen</h1>
      <SubTabs label="Routinen" base="/routinen" tabs={TABS} active={tab} testId="routine-tabs" />
      {fehler ? <Notice kind="error">{errorMessages[fehler] ?? "Das hat nicht geklappt."}</Notice> : null}
      {ok ? <Notice kind="ok">{okMessages[ok] ?? "Gespeichert."}</Notice> : null}
      {tab === "neu" ? <NewTab today={dash.today} profiles={dash.profiles} vorlage={one(sp.vorlage)} /> : null}
      {tab === "alle" ? <AllTab userId={user.id} familyId={familyId} archiv={archiv} profiles={dash.profiles} /> : null}
      {tab === "woche" ? <WeekTab userId={user.id} familyId={familyId} today={dash.today} me={dash.myProfileId} profiles={dash.profiles} /> : null}
    </div>
  );
}

type Profiles = Awaited<ReturnType<typeof getDashboard>>["profiles"];

function NewTab({ today, profiles, vorlage }: { today: string; profiles: Profiles; vorlage?: string }) {
  const t = templateByKey(vorlage);
  return (
    <>
      <Card title="Vorlagen">
        <p className="mb-3 text-sm text-stone-600">Eine Vorlage füllt das Formular vor. Du kannst alles ändern, bevor du speicherst.</p>
        <ul className="flex flex-wrap gap-2">
          {ROUTINE_TEMPLATES.map((x) => (
            <li key={x.key}>
              <Link href={`/routinen?tab=neu&vorlage=${x.key}`} aria-current={t?.key === x.key ? "true" : undefined} className={ghostButtonCls}>{x.title}</Link>
            </li>
          ))}
        </ul>
      </Card>
      <Card title={t ? `Neue Routine: ${t.title}` : "Neue Routine"}>
        <form action={createRoutineAction} key={t?.key ?? "leer"}>
          <RoutineFields
            profiles={profiles}
            v={{
              title: t?.title ?? "",
              description: t?.description || null,
              freq: t?.freq ?? "DAILY",
              interval: 1,
              weekdays: t?.weekdays ?? [],
              monthDay: null,
              startDate: today,
              endDate: null,
              timeOfDay: t?.timeOfDay ?? null,
              assignMode: "FIXED",
              assigneeIds: [],
            }}
          />
          <button className={buttonCls}>Routine anlegen</button>
        </form>
        <p className="mt-3 text-xs text-stone-600">
          Termine werden bis zu 8 Wochen im Voraus angelegt und automatisch nachgefüllt; weiter zurückliegende Termine entstehen nicht rückwirkend.
        </p>
      </Card>
    </>
  );
}

async function AllTab({ userId, familyId, archiv, profiles }: { userId: string; familyId: string; archiv: boolean; profiles: Profiles }) {
  const routines = await listRoutines(userId, familyId, archiv);
  return (
    <Card title={`Alle Routinen (${routines.length})`}>
      {routines.length === 0 ? (
        <p className="text-stone-600">
          Noch keine Routinen. <Link href="/routinen?tab=neu" className="underline">Neue Routine anlegen</Link>
        </p>
      ) : (
        <ul className="divide-y divide-stone-100">
          {routines.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 py-3" data-testid="routine-row">
              <span className="min-w-0 flex-1">
                <span className="block break-words font-medium">{r.title}</span>
                <span className="block text-sm text-stone-600">
                  {describeRule(ruleOf(r))}{r.timeOfDay ? `, ${r.timeOfDay} Uhr` : ""} · {MODE[r.assignMode]}
                  {r.assignments.length ? `: ${names(profiles, r.assignments.map((a) => a.profileId))}` : " · niemand zugewiesen"}
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
        <Link href={archiv ? "/routinen?tab=alle" : "/routinen?tab=alle&archiv=1"} className="inline-flex min-h-11 items-center underline">
          {archiv ? "Archivierte ausblenden" : "Archivierte anzeigen"}
        </Link>
      </p>
    </Card>
  );
}

async function WeekTab({ userId, familyId, today, me, profiles }: { userId: string; familyId: string; today: string; me: string | null; profiles: Profiles }) {
  const all = await listOccurrences(userId, familyId, today, addDays(today, 6));
  const mine = me ? all.filter((o) => o.assigneeIds.includes(me)) : [];
  const byDay = new Map<string, typeof mine>();
  for (const o of mine) byDay.set(o.date, [...(byDay.get(o.date) ?? []), o]);
  return (
    <Card title="Meine Termine der nächsten 7 Tage">
      {byDay.size === 0 ? (
        <p className="text-stone-600">
          {me ? "Keine Routine-Termine für dich in den nächsten 7 Tagen." : "Du hast noch kein Profil in dieser Familie."}{" "}
          <Link href="/routinen?tab=alle" className="underline">Alle Routinen ansehen</Link>
        </p>
      ) : (
        <div className="space-y-4">
          {[...byDay.entries()].map(([iso, list]) => (
            <section key={iso} aria-label={fmtDay(iso)}>
              <h3 className={`text-sm font-semibold ${iso === today ? "text-terracotta-dark" : "text-stone-700"}`}>
                {fmtDay(iso)}{iso === today ? " (heute)" : ""}
              </h3>
              <ul className="divide-y divide-stone-100">
                {list.map((o) => (
                  <OccurrenceRow key={o.id} o={o} profiles={profiles} back="/routinen?tab=woche" today={today} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </Card>
  );
}
