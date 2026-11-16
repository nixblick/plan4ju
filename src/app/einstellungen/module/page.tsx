import Link from "next/link";
import { errorMessages, okMessages, one } from "@/lib/messages";
import { MODULE_KEYS, MODULES } from "@/lib/modules";
import { atLeast } from "@/server/permissions";
import { getModules } from "@/server/services/modules";
import { requireFamily } from "@/server/session";
import { allowedElements, DASHBOARD_ELEMENTS } from "@/lib/dashboard-elements";
import { getDashboardLayout } from "@/server/services/dashboard-prefs";
import { moveDashboardAction, setDashboardAction, setModuleAction } from "../../module-actions";
import { buttonCls, Card, ghostButtonCls, Notice } from "../../ui";
import { EinstellungenTabs } from "../tabs";

export const dynamic = "force-dynamic";

/** Optional modules (Release 0.5): each one on or off for the whole family, independent of the others. */
export default async function Module({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { user, familyId, role } = await requireFamily();
  const sp = await searchParams;
  const fehler = one(sp.fehler);
  const ok = one(sp.ok);
  const [state, layout] = await Promise.all([getModules(user.id, familyId), getDashboardLayout(user.id, familyId)]);
  const { hidden } = layout;
  const allowed = allowedElements(state);
  const offered = layout.order.filter((k) => allowed.includes(k));
  const isAdmin = atLeast(role, "ADMIN");
  return (
    <div className="space-y-6">
      <EinstellungenTabs active="module" />
      <h1 className="text-2xl font-bold">Module</h1>
      {fehler ? <Notice kind="error">{errorMessages[fehler] ?? "Das hat nicht geklappt."}</Notice> : null}
      {ok ? <Notice kind="ok">{okMessages[ok] ?? "Gespeichert."}</Notice> : null}
      <p className="text-sm text-stone-600">
        Jedes Modul lässt sich für die ganze Familie einzeln ein- und ausschalten. Ausgeschaltet verschwindet es aus Navigation und
        Startseite, gespeicherte Einträge bleiben erhalten und sind nach dem Einschalten wieder da. Aufgaben, Routinen, Kalender,
        Geburtstage und Einkaufsliste bleiben immer an. Prospekte, FES, Schule heute und Sterne sind bei neuen Familien zu Beginn aus.
      </p>
      <Card title="Schalter">
        <ul className="divide-y divide-stone-100">
          {MODULE_KEYS.map((k) => (
            <li key={k} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between" data-testid="module-row">
              <span className="min-w-0 flex-1">
                <strong>{MODULES[k].label}</strong>
                <span className={`ml-2 rounded-full px-2 py-0.5 text-xs ${state[k] ? "bg-green-100 text-green-800" : "bg-stone-200 text-stone-700"}`}>
                  {state[k] ? "an" : "aus"}
                </span>
                <span className="block text-sm text-stone-600">{MODULES[k].description}</span>
              </span>
              {isAdmin ? (
                <form action={setModuleAction}>
                  <input type="hidden" name="module" value={k} />
                  <input type="hidden" name="on" value={state[k] ? "0" : "1"} />
                  <button className={state[k] ? ghostButtonCls : buttonCls}>
                    {state[k] ? `${MODULES[k].label} ausschalten` : `${MODULES[k].label} einschalten`}
                  </button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
        {isAdmin ? null : <p className="mt-2 text-sm text-stone-600">Module schalten nur Admins der Familie.</p>}
      </Card>
      <Card title="Meine Startseite">
        <form action={setDashboardAction} className="space-y-3" data-testid="dashboard-prefs">
          {/* Enter in the form saves the ticks, not the first arrow button. */}
          <button className="hidden" tabIndex={-1} aria-hidden="true">Startseite speichern</button>
          <p className="text-sm text-stone-600">
            Was „Heute“ für dich zeigt und in welcher Reihenfolge (von oben nach unten). Gilt nur für dich; Elemente
            ausgeschalteter Module erscheinen hier nicht. „Nach oben“ und „Nach unten“ speichern sofort, auch die Haken.
          </p>
          <ol className="divide-y divide-stone-100" data-testid="dashboard-order">
            {offered.map((k, i) => (
              <li key={k} className="flex items-center gap-2" data-testid="dashboard-row">
                <input type="hidden" name="offered" value={k} />
                <label className="flex min-h-11 min-w-0 flex-1 items-center gap-3 text-sm">
                  <input type="checkbox" name="show" value={k} defaultChecked={!hidden.includes(k)} className="h-5 w-5 shrink-0 accent-terracotta" />
                  <span className="min-w-0 break-words">{DASHBOARD_ELEMENTS[k].label}</span>
                </label>
                <span className="flex shrink-0 gap-1">
                  {i > 0 ? (
                    <button formAction={moveDashboardAction} name="move" value={`${k}:up`} className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-stone-300 bg-white" aria-label={`${DASHBOARD_ELEMENTS[k].label} nach oben`}>
                      <span aria-hidden="true">↑</span>
                    </button>
                  ) : <span className="h-11 w-11" aria-hidden="true" />}
                  {i < offered.length - 1 ? (
                    <button formAction={moveDashboardAction} name="move" value={`${k}:down`} className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-stone-300 bg-white" aria-label={`${DASHBOARD_ELEMENTS[k].label} nach unten`}>
                      <span aria-hidden="true">↓</span>
                    </button>
                  ) : <span className="h-11 w-11" aria-hidden="true" />}
                </span>
              </li>
            ))}
          </ol>
          <button className={buttonCls}>Startseite speichern</button>
        </form>
      </Card>
      {role === "OWNER" ? (
        <p className="text-sm">
          <Link href="/einstellungen/meldungen" className="text-terracotta-dark underline">Meldungen, die nicht zugestellt wurden</Link>
        </p>
      ) : null}
    </div>
  );
}
