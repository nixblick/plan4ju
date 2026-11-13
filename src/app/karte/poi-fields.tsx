import type { CategoryView, PoiView } from "@/server/services/map";
import { Field, inputCls } from "../ui";

/** Form fields of a point. lat/lng get fixed ids so the map can fill them on click. */
export function PoiFields({ categories, poi, idPrefix }: { categories: CategoryView[]; poi?: PoiView; idPrefix: string }) {
  const usable = categories.filter((c) => c.active || c.id === poi?.category.id);
  return (
    <>
      <Field label="Name">
        <input name="name" required maxLength={120} defaultValue={poi?.name} className={inputCls} />
      </Field>
      <Field label="Kategorie">
        <select name="categoryId" required defaultValue={poi?.category.id ?? ""} className={inputCls}>
          <option value="" disabled>Bitte wählen</option>
          {usable.map((c) => (
            <option key={c.id} value={c.id}>{c.name}{c.active ? "" : " (ausgeschaltet)"}</option>
          ))}
        </select>
      </Field>
      <p className="mb-2 text-sm text-stone-600">Position: auf die Karte tippen (Markierung lässt sich ziehen) oder Koordinaten eingeben.</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Breite (Lat)">
          <input id={`${idPrefix}-lat`} name="lat" required inputMode="decimal" defaultValue={poi?.lat} placeholder="50.1" className={inputCls} />
        </Field>
        <Field label="Länge (Lng)">
          <input id={`${idPrefix}-lng`} name="lng" required inputMode="decimal" defaultValue={poi?.lng} placeholder="8.6" className={inputCls} />
        </Field>
      </div>
      <Field label="Adresse (optional, nur Text)">
        <input name="address" maxLength={300} defaultValue={poi?.address ?? ""} className={inputCls} />
      </Field>
      <Field label="Beschreibung (optional)">
        <textarea name="description" maxLength={2000} rows={2} defaultValue={poi?.description ?? ""} className={inputCls} />
      </Field>
      <Field label="Link (optional, https://)">
        <input name="url" type="url" maxLength={2000} defaultValue={poi?.url ?? ""} className={inputCls} />
      </Field>
      <Field label="Bild-Link (optional, wird nur verlinkt)">
        <input name="imageUrl" type="url" maxLength={2000} defaultValue={poi?.imageUrl ?? ""} className={inputCls} />
      </Field>
      <Field label="Bewertung (optional)">
        <select name="rating" defaultValue={poi?.rating ?? ""} className={inputCls}>
          <option value="">keine</option>
          {[5, 4, 3, 2, 1].map((n) => (
            <option key={n} value={n}>{"★".repeat(n)}{"☆".repeat(5 - n)}</option>
          ))}
        </select>
      </Field>
      <Field label="Notiz (optional)">
        <textarea name="note" maxLength={1000} rows={2} defaultValue={poi?.note ?? ""} className={inputCls} />
      </Field>
      <fieldset className="mb-4 rounded-xl border border-stone-200 p-3">
        <legend className="px-1 text-sm font-medium">Zeitraum (nur für Veranstaltungen)</legend>
        <p className="mb-2 text-sm text-stone-600">Nach dem letzten Tag verschwindet der Ort von der Karte und landet im Archiv. Ohne Zeitraum bleibt er dauerhaft.</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Von">
            <input name="startDate" type="date" defaultValue={poi?.startDate ?? ""} className={inputCls} />
          </Field>
          <Field label="Bis">
            <input name="endDate" type="date" defaultValue={poi?.endDate ?? ""} className={inputCls} />
          </Field>
        </div>
      </fieldset>
    </>
  );
}
