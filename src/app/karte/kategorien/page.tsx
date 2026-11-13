import Link from "next/link";
import { MAP_ICON_KEYS, MAP_ICON_LABELS, MAP_ICONS, type MapIcon } from "@/lib/map";
import { errorMessages, okMessages, one } from "@/lib/messages";
import { atLeast } from "@/server/permissions";
import { listCategories, type CategoryView } from "@/server/services/map";
import { requireFamily } from "@/server/session";
import { buttonCls, Card, Field, inputCls, Notice } from "../../ui";
import { createCategoryAction, updateCategoryAction } from "../../karte-actions";

export const dynamic = "force-dynamic";

function CatSymbol({ icon, color }: { icon: MapIcon; color: string }) {
  return (
    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ background: color }}>
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={MAP_ICONS[icon]} />
      </svg>
    </span>
  );
}

function CategoryFields({ c }: { c?: CategoryView }) {
  return (
    <>
      <Field label="Name">
        <input name="name" required maxLength={60} defaultValue={c?.name} className={inputCls} />
      </Field>
      <Field label="Beschreibung (optional)">
        <input name="description" maxLength={2000} defaultValue={c?.description ?? ""} className={inputCls} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Symbol">
          <select name="icon" defaultValue={c?.icon ?? "pin"} className={inputCls}>
            {MAP_ICON_KEYS.map((k) => <option key={k} value={k}>{MAP_ICON_LABELS[k]}</option>)}
          </select>
        </Field>
        <Field label="Farbe">
          <input name="color" type="color" defaultValue={c?.color ?? "#c2410c"} className="h-11 w-full rounded-xl border border-stone-300" />
        </Field>
      </div>
      <label className="mb-4 flex min-h-11 items-center gap-2">
        <input type="checkbox" name="active" defaultChecked={c?.active ?? true} className="h-5 w-5" />
        <span>Aktiv (für neue Orte wählbar)</span>
      </label>
    </>
  );
}

export default async function Kategorien({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { user, familyId, role } = await requireFamily();
  const sp = await searchParams;
  const fehler = one(sp.fehler);
  const ok = one(sp.ok);
  const categories = await listCategories(user.id, familyId);
  const admin = atLeast(role, "ADMIN");

  return (
    <div className="space-y-6">
      <p className="text-sm"><Link className="text-terracotta-dark underline" href="/karte">← Zur Karte</Link></p>
      <h1 className="text-2xl font-bold">Kategorien</h1>
      {fehler ? <Notice kind="error">{errorMessages[fehler] ?? "Das hat nicht geklappt."}</Notice> : null}
      {ok ? <Notice kind="ok">{okMessages[ok] ?? "Gespeichert."}</Notice> : null}
      {!admin ? <p className="text-stone-600">Kategorien verwalten nur Admins der Familie.</p> : null}

      <Card title="Alle Kategorien">
        <ul className="divide-y divide-stone-100">
          {categories.map((c) => (
            <li key={c.id} className="py-3" data-testid="category-row">
              <div className="flex items-center gap-3">
                <CatSymbol icon={c.icon} color={c.color} />
                <span className="min-w-0 flex-1 break-words font-medium">{c.name}</span>
                <span className="text-sm text-stone-600">{c.active ? `${c.poiCount} Orte` : "ausgeschaltet"}</span>
              </div>
              {admin ? (
                <details className="mt-2">
                  <summary className="min-h-11 cursor-pointer py-2 text-sm text-terracotta-dark">Bearbeiten</summary>
                  <form action={updateCategoryAction} className="mt-2">
                    <input type="hidden" name="categoryId" value={c.id} />
                    <CategoryFields c={c} />
                    <button className={buttonCls}>Speichern</button>
                  </form>
                </details>
              ) : null}
            </li>
          ))}
        </ul>
      </Card>

      {admin ? (
        <Card title="Neue Kategorie">
          <form action={createCategoryAction}>
            <CategoryFields />
            <button className={buttonCls}>Kategorie anlegen</button>
          </form>
        </Card>
      ) : null}
    </div>
  );
}
