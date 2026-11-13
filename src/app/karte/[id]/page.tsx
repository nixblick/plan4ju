import Link from "next/link";
import { notFound } from "next/navigation";
import { errorMessages, okMessages, one } from "@/lib/messages";
import { NotFoundError } from "@/server/errors";
import { mapConfig } from "@/server/map-config";
import { getPoi, listCategories, type PoiView } from "@/server/services/map";
import { requireFamily } from "@/server/session";
import { buttonCls, Card, Notice } from "../../ui";
import { deletePoiAction, updatePoiAction } from "../../karte-actions";
import { MapView } from "../map-view";
import { PoiFields } from "../poi-fields";
import { periodText } from "../period";
import { pageModule } from "@/server/active-modules";

export const dynamic = "force-dynamic";

export default async function Ort({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await pageModule("map");
  const { user, familyId } = await requireFamily();
  const { id } = await params;
  const sp = await searchParams;
  const fehler = one(sp.fehler);
  const ok = one(sp.ok);
  let p: PoiView;
  try {
    p = await getPoi(user.id, familyId, id);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
  const categories = p.canEdit ? await listCategories(user.id, familyId) : [];
  const cfg = mapConfig();
  const point = { id: p.id, name: p.name, lat: p.lat, lng: p.lng, icon: p.category.icon, color: p.category.color, href: `/karte/${p.id}` };

  return (
    <div className="space-y-6">
      <p className="text-sm"><Link className="text-terracotta-dark underline" href="/karte">← Zur Karte</Link></p>
      <h1 className="break-words text-2xl font-bold">{p.name}</h1>
      {fehler ? <Notice kind="error">{errorMessages[fehler] ?? "Das hat nicht geklappt."}</Notice> : null}
      {ok ? <Notice kind="ok">{okMessages[ok] ?? "Gespeichert."}</Notice> : null}

      <MapView
        tileUrl={cfg.tileUrl}
        attribution={cfg.attribution}
        points={p.canEdit ? [] : [point]}
        pick={p.canEdit ? { lat: "ort-lat", lng: "ort-lng" } : undefined}
        pickStart={p.canEdit ? { lat: p.lat, lng: p.lng } : undefined}
        height="h-64 md:h-96"
      />

      <Card>
        <dl className="space-y-2 text-sm">
          <div><dt className="inline font-medium">Kategorie: </dt><dd className="inline">{p.category.name}</dd></div>
          {p.startDate ? <div><dt className="inline font-medium">Zeitraum: </dt><dd className="inline">{periodText(p.startDate, p.endDate)}{p.archived ? " (abgelaufen, im Archiv)" : ""}</dd></div> : null}
          {p.address ? <div><dt className="inline font-medium">Adresse: </dt><dd className="inline break-words">{p.address}</dd></div> : null}
          {p.description ? <div><dt className="font-medium">Beschreibung</dt><dd className="whitespace-pre-line break-words">{p.description}</dd></div> : null}
          {p.url ? <div><dt className="inline font-medium">Link: </dt><dd className="inline break-all"><a className="text-terracotta-dark underline" href={p.url} target="_blank" rel="noopener nofollow noreferrer" referrerPolicy="no-referrer">{p.url}</a></dd></div> : null}
          {p.imageUrl ? <div><dt className="inline font-medium">Bild: </dt><dd className="inline break-all"><a className="text-terracotta-dark underline" href={p.imageUrl} target="_blank" rel="noopener nofollow noreferrer" referrerPolicy="no-referrer">Bild öffnen</a></dd></div> : null}
          {p.rating ? <div><dt className="inline font-medium">Bewertung: </dt><dd className="inline" aria-label={`${p.rating} von 5`}>{"★".repeat(p.rating)}{"☆".repeat(5 - p.rating)}</dd></div> : null}
          {p.note ? <div><dt className="font-medium">Notiz</dt><dd className="whitespace-pre-line break-words">{p.note}</dd></div> : null}
          <div><dt className="inline font-medium">Eingetragen von: </dt><dd className="inline">{p.creatorName}, {p.createdAt.toLocaleDateString("de-DE")}</dd></div>
          <div><dt className="inline font-medium">Koordinaten: </dt><dd className="inline">{p.lat.toFixed(5)}, {p.lng.toFixed(5)}</dd></div>
        </dl>
      </Card>

      {p.canEdit ? (
        <>
          <Card title="Bearbeiten oder verschieben">
            <form action={updatePoiAction}>
              <input type="hidden" name="poiId" value={p.id} />
              <PoiFields categories={categories} poi={p} idPrefix="ort" />
              <button className={buttonCls}>Speichern</button>
            </form>
          </Card>
          <Card title="Löschen">
            <details>
              <summary className="min-h-11 cursor-pointer py-2 text-red-700">Ort löschen …</summary>
              <form action={deletePoiAction} className="mt-2">
                <input type="hidden" name="poiId" value={p.id} />
                <p className="mb-2 text-sm text-stone-600">Der Ort wird für die ganze Familie gelöscht.</p>
                <button className="inline-flex min-h-11 items-center rounded-xl bg-red-700 px-4 py-2 font-medium text-white">Endgültig löschen</button>
              </form>
            </details>
          </Card>
        </>
      ) : null}
    </div>
  );
}
