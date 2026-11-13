import Link from "next/link";
import { errorMessages, okMessages, one } from "@/lib/messages";
import { atLeast } from "@/server/permissions";
import { mapConfig } from "@/server/map-config";
import { listCategories, listPoiCreators, listPois } from "@/server/services/map";
import { requireFamily } from "@/server/session";
import { FesteTabs } from "../geburtstage/tabs";
import { buttonCls, Card, ghostButtonCls, inputCls, Notice } from "../ui";
import { createPoiAction } from "../karte-actions";
import { MapView } from "./map-view";
import { PoiFields } from "./poi-fields";
import { periodText } from "./period";
import { pageModule } from "@/server/active-modules";

export const dynamic = "force-dynamic";

const idParam = (v: string | undefined) => (v && /^[A-Za-z0-9_-]{1,64}$/.test(v) ? v : null);

export default async function Karte({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await pageModule("map");
  const { user, familyId, role } = await requireFamily();
  const sp = await searchParams;
  const fehler = one(sp.fehler);
  const ok = one(sp.ok);
  const filter = {
    categoryId: idParam(one(sp.kategorie)),
    createdById: idParam(one(sp.von)),
    q: (one(sp.q) ?? "").slice(0, 120),
    archived: one(sp.archiv) === "1",
  };
  const [categories, pois, creators] = await Promise.all([
    listCategories(user.id, familyId),
    listPois(user.id, familyId, filter),
    listPoiCreators(user.id, familyId),
  ]);
  const cfg = mapConfig();
  const points = pois.map((p) => ({ id: p.id, name: p.name, lat: p.lat, lng: p.lng, icon: p.category.icon, color: p.category.color, href: `/karte/${p.id}` }));
  const filtered = Boolean(filter.categoryId || filter.createdById || filter.q);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Karte</h1>
      <FesteTabs active="karte" />
      {fehler ? <Notice kind="error">{errorMessages[fehler] ?? "Das hat nicht geklappt."}</Notice> : null}
      {ok ? <Notice kind="ok">{okMessages[ok] ?? "Gespeichert."}</Notice> : null}

      <form method="get" className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]" aria-label="Filter">
        <label className="sr-only" htmlFor="f-kat">Kategorie</label>
        <select id="f-kat" name="kategorie" defaultValue={filter.categoryId ?? ""} className={inputCls}>
          <option value="">Alle Kategorien</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <label className="sr-only" htmlFor="f-von">Eingetragen von</label>
        <select id="f-von" name="von" defaultValue={filter.createdById ?? ""} className={inputCls}>
          <option value="">Von allen</option>
          {creators.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <label className="sr-only" htmlFor="f-q">Name suchen</label>
        <input id="f-q" name="q" type="search" placeholder="Name suchen" defaultValue={filter.q} className={inputCls} />
        {filter.archived ? <input type="hidden" name="archiv" value="1" /> : null}
        <button className={ghostButtonCls}>Filtern</button>
      </form>

      <div className="grid gap-4 md:grid-cols-[2fr_1fr]">
        <MapView tileUrl={cfg.tileUrl} attribution={cfg.attribution} points={points} pick={filter.archived ? undefined : { lat: "neu-lat", lng: "neu-lng" }} />
        <Card title={filter.archived ? "Archiv" : "Orte"}>
          {pois.length === 0 ? (
            <p className="text-stone-600">{filtered ? "Nichts gefunden." : filter.archived ? "Noch nichts archiviert." : "Noch keine Orte. Tippe auf die Karte und trag unten den ersten ein."}</p>
          ) : (
            <ul className="divide-y divide-stone-100">
              {pois.map((p) => (
                <li key={p.id} data-testid="poi-row">
                  <Link href={`/karte/${p.id}`} className="block min-h-11 py-2">
                    <span className="block break-words font-medium text-terracotta-dark underline">{p.name}</span>
                    <span className="block text-sm text-stone-600">
                      {p.category.name} · {p.creatorName}
                      {p.startDate ? ` · ${periodText(p.startDate, p.endDate)}` : ""}
                      {p.rating ? ` · ${"★".repeat(p.rating)}` : ""}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-sm">
            <Link className="text-terracotta-dark underline" href={filter.archived ? "/karte" : "/karte?archiv=1"}>
              {filter.archived ? "Zurück zur aktiven Karte" : "Archiv abgelaufener Veranstaltungen"}
            </Link>
          </p>
        </Card>
      </div>

      {filter.archived ? null : (
        <Card title="Neuer Ort">
          <form action={createPoiAction}>
            <PoiFields categories={categories} idPrefix="neu" />
            <button className={buttonCls}>Ort speichern</button>
          </form>
        </Card>
      )}

      {atLeast(role, "ADMIN") ? (
        <p className="text-sm">
          <Link className="text-terracotta-dark underline" href="/karte/kategorien">Kategorien verwalten</Link>
        </p>
      ) : null}
      <p className="text-xs text-stone-500">Kartenbilder lädt dein Browser direkt vom Kachel-Server; der sieht dabei deine IP-Adresse. Die Orte selbst bleiben in Plan4JU.</p>
    </div>
  );
}
