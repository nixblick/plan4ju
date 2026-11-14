import { removeImageAction, uploadImageAction } from "./rezepte-actions";
import { buttonCls, ghostButtonCls, inputCls } from "./ui";

/** Shows the uploaded picture (if any) and a small form to upload, replace or remove it. */
export function ImageUpload({ kind, ownerId, imageId, back, alt, canEdit = true }: { kind: "recipe" | "wish"; ownerId: string; imageId: string | null; back: string; alt: string; canEdit?: boolean }) {
  return (
    <div className="space-y-2">
      {imageId ? (
        // eslint-disable-next-line @next/next/no-img-element -- protected route, no image optimizer
        <img src={`/api/bild/${imageId}`} alt={alt} className="max-h-72 w-full rounded-lg object-contain" loading="lazy" />
      ) : null}
      {canEdit ? (
        <>
          <form action={uploadImageAction} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="kind" value={kind} />
            <input type="hidden" name="ownerId" value={ownerId} />
            <input type="hidden" name="back" value={back} />
            <label className="sr-only" htmlFor={`bild-${ownerId}`}>Bild auswählen</label>
            <input id={`bild-${ownerId}`} className={`${inputCls} min-w-0 flex-1`} type="file" name="bild" accept="image/png,image/jpeg,image/webp" required />
            <button className={buttonCls}>{imageId ? "Bild ersetzen" : "Bild hochladen"}</button>
          </form>
          <p className="text-xs text-stone-600">PNG, JPEG oder WebP bis 5 MB. Ortsangaben und andere Metadaten werden entfernt; das Bild sieht nur deine Familie.</p>
          {imageId ? (
            <form action={removeImageAction}>
              <input type="hidden" name="kind" value={kind} />
              <input type="hidden" name="ownerId" value={ownerId} />
              <input type="hidden" name="back" value={back} />
              <button className={ghostButtonCls}>Bild entfernen</button>
            </form>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
