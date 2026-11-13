import Link from "next/link";
import { notFound } from "next/navigation";
import { errorMessages, okMessages, one } from "@/lib/messages";
import { FLYER_MAX, FLYER_NAME_MAX } from "@/lib/modules";
import { NotFoundError } from "@/server/errors";
import { getFlyers, type FlyerView } from "@/server/services/modules";
import { requireFamily } from "@/server/session";
import { addFlyerAction, deleteFlyerAction, updateFlyerAction } from "../../module-actions";
import { buttonCls, Card, ghostButtonCls, inputCls, Notice } from "../../ui";

export const dynamic = "force-dynamic";

/** Optional module "Prospekte": links to the retailers' own flyer pages. Nothing is fetched or stored from them. */
export default async function Prospekte({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { user, familyId } = await requireFamily();
  const sp = await searchParams;
  const fehler = one(sp.fehler);
  const ok = one(sp.ok);
  let v: FlyerView;
  try {
    v = await getFlyers(user.id, familyId);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
  const active = v.links.filter((l) => l.active);
  return (
    <div className="space-y-5">
      <Link href="/einkauf" className="text-sm text-terracotta-dark underline">← Einkaufsliste</Link>
      <h1 className="text-2xl font-bold">Prospekte</h1>
      {fehler ? <Notice kind="error">{errorMessages[fehler] ?? "Das hat nicht geklappt."}</Notice> : null}
      {ok ? <Notice kind="ok">{okMessages[ok] ?? "Gespeichert."}</Notice> : null}
      <p className="text-sm text-stone-600">
        Die Prospekte öffnen sich auf der Seite des Händlers. Plan4JU lädt und speichert keine fremden Inhalte.
      </p>
      {active.length === 0 ? (
        <p className="text-sm text-stone-600">Noch keine Händler eingetragen.</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {active.map((l) => (
            <li key={l.id} data-testid="flyer-link">
              <a
                href={l.url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="flex min-h-14 items-center justify-between gap-3 rounded-xl bg-white px-4 py-3 font-medium shadow-sm ring-1 ring-stone-200 hover:bg-orange-50"
              >
                <span className="min-w-0 break-words">{l.name}</span>
                <span className="shrink-0 text-sm text-terracotta-dark">Prospekt öffnen ↗</span>
              </a>
            </li>
          ))}
        </ul>
      )}
      {v.canManage ? (
        <>
          <Card title="Händler verwalten">
            <ul className="space-y-3">
              {v.links.map((l) => (
                <li key={l.id} className="rounded-xl bg-stone-50 p-3" data-testid="flyer-row">
                  <form action={updateFlyerAction} className="space-y-2">
                    <input type="hidden" name="id" value={l.id} />
                    <input name="name" aria-label={`Name von ${l.name}`} defaultValue={l.name} maxLength={FLYER_NAME_MAX} required className={inputCls} />
                    <input name="url" type="url" aria-label={`Adresse von ${l.name}`} defaultValue={l.url} required className={inputCls} />
                    <label className="flex min-h-11 items-center gap-2 text-sm">
                      <input type="checkbox" name="active" value="1" defaultChecked={l.active} />
                      Anzeigen
                    </label>
                    <button className={ghostButtonCls} aria-label={`${l.name} speichern`}>Speichern</button>
                  </form>
                  <form action={deleteFlyerAction} className="mt-2">
                    <input type="hidden" name="id" value={l.id} />
                    <button className={ghostButtonCls} aria-label={`${l.name} entfernen`}>Entfernen</button>
                  </form>
                </li>
              ))}
            </ul>
          </Card>
          {v.links.length < FLYER_MAX ? (
            <Card title="Händler hinzufügen">
              <form action={addFlyerAction} className="space-y-2">
                <input name="name" aria-label="Name des Händlers" maxLength={FLYER_NAME_MAX} required className={inputCls} placeholder="z. B. Wochenmarkt" />
                <input name="url" type="url" aria-label="Adresse der Prospektseite (https)" required className={inputCls} placeholder="https://" />
                <button className={buttonCls}>Hinzufügen</button>
              </form>
            </Card>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
