import Link from "next/link";
import { errorMessages, okMessages, one } from "@/lib/messages";
import { MODULE_KEYS, MODULES } from "@/lib/modules";
import { atLeast } from "@/server/permissions";
import { getModules } from "@/server/services/modules";
import { requireFamily } from "@/server/session";
import { setModuleAction } from "../../module-actions";
import { buttonCls, Card, ghostButtonCls, Notice } from "../../ui";
import { FamilieTabs } from "../tabs";

export const dynamic = "force-dynamic";

/** Optional modules (Release 0.5): each one on or off for the whole family, independent of the others. */
export default async function Module({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { user, familyId, role } = await requireFamily();
  const sp = await searchParams;
  const fehler = one(sp.fehler);
  const ok = one(sp.ok);
  const state = await getModules(user.id, familyId);
  const isAdmin = atLeast(role, "ADMIN");
  return (
    <div className="space-y-6">
      <FamilieTabs active="module" />
      <h1 className="text-2xl font-bold">Module</h1>
      {fehler ? <Notice kind="error">{errorMessages[fehler] ?? "Das hat nicht geklappt."}</Notice> : null}
      {ok ? <Notice kind="ok">{okMessages[ok] ?? "Gespeichert."}</Notice> : null}
      <p className="text-sm text-stone-600">
        Jedes Modul lässt sich für die ganze Familie einzeln ein- und ausschalten. Ausgeschaltet verschwindet es aus Navigation und
        Startseite, gespeicherte Einträge bleiben erhalten und sind nach dem Einschalten wieder da. Aufgaben, Routinen, Kalender,
        Geburtstage und Einkaufsliste bleiben immer an. Prospekte und Abfallkalender sind zu Beginn aus.
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
      {role === "OWNER" ? (
        <p className="text-sm">
          <Link href="/familie/meldungen" className="text-terracotta-dark underline">Meldungen, die nicht zugestellt wurden</Link>
        </p>
      ) : null}
    </div>
  );
}
