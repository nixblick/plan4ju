import { Field, inputCls } from "../ui";
import { occasionLabels, OCCASIONS, wishPriorityLabels } from "@/lib/wishes";

type Profile = { id: string; displayName: string };
type Birthday = { id: string; name: string; day: number; month: number };

export function ListFields({
  profiles,
  birthdays,
  l,
  canMakePrivate = true,
  lockOwner = false,
}: {
  profiles: Profile[];
  birthdays: Birthday[];
  l?: { title: string; description: string | null; profileId: string | null; personName: string | null; visibility: string; surprise: boolean; birthday: { id: string } | null };
  canMakePrivate?: boolean;
  /** the wishing person edits: owner and surprise mode (once on) stay as they are */
  lockOwner?: boolean;
}) {
  const owner = l ? (l.profileId ? `p:${l.profileId}` : "person") : "";
  return (
    <>
      <Field label="Name des Wunschzettels">
        <input className={inputCls} name="title" maxLength={100} defaultValue={l?.title} required />
      </Field>
      {lockOwner ? (
        <>
          <input type="hidden" name="owner" value={owner} />
          <input type="hidden" name="personName" value={l?.personName ?? ""} />
        </>
      ) : (
      <>
      <Field label="Für wen?">
        <select className={inputCls} name="owner" defaultValue={owner} required>
          <option value="" disabled>Bitte wählen</option>
          {profiles.map((p) => (
            <option key={p.id} value={`p:${p.id}`}>{p.displayName}</option>
          ))}
          <option value="person">Andere Person (ohne Profil)</option>
        </select>
      </Field>
      <Field label="Name der Person (nur bei „Andere Person“)">
        <input className={inputCls} name="personName" maxLength={100} defaultValue={l?.personName ?? ""} />
      </Field>
      </>
      )}
      <Field label="Beschreibung (optional)">
        <input className={inputCls} name="description" maxLength={1000} defaultValue={l?.description ?? ""} />
      </Field>
      <Field label="Geburtstag verknüpfen (optional)">
        <select className={inputCls} name="birthdayId" defaultValue={l?.birthday?.id ?? ""}>
          <option value="">Kein Geburtstag</option>
          {birthdays.map((b) => (
            <option key={b.id} value={b.id}>{b.name} ({b.day}.{b.month}.)</option>
          ))}
        </select>
      </Field>
      <Field label="Wer sieht den Wunschzettel?">
        <select className={inputCls} name="visibility" defaultValue={l?.visibility ?? "FAMILY"}>
          <option value="FAMILY">Die ganze Familie</option>
          {canMakePrivate ? <option value="PRIVATE">Nur ich</option> : null}
        </select>
      </Field>
      {lockOwner && l?.surprise ? (
        <input type="hidden" name="surprise" value="on" />
      ) : (
      <label className="mb-4 flex min-h-11 items-start gap-3">
        <input type="checkbox" name="surprise" defaultChecked={l?.surprise ?? true} className="mt-1 h-5 w-5" />
        <span className="text-sm">
          <span className="font-medium">Überraschungsmodus</span>
          <span className="block text-stone-600">Die beschenkte Person sieht nicht, ob etwas reserviert ist. Ohne Haken sieht sie „reserviert“, aber nie von wem.</span>
        </span>
      </label>
      )}
    </>
  );
}

export function WishFields({
  w,
}: {
  w?: { title: string; description: string | null; url: string | null; imageUrl: string | null; priceCents: number | null; priority: number; note: string | null; occasion: string };
}) {
  return (
    <>
      <Field label="Wunsch">
        <input className={inputCls} name="title" maxLength={200} defaultValue={w?.title} required />
      </Field>
      <Field label="Beschreibung (optional)">
        <input className={inputCls} name="description" maxLength={1000} defaultValue={w?.description ?? ""} />
      </Field>
      <Field label="Link (optional, nur https://)">
        <input className={inputCls} type="url" name="url" maxLength={2000} pattern="https://.*" placeholder="https://" defaultValue={w?.url ?? ""} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Preis (optional)">
          <input className={inputCls} name="price" inputMode="decimal" placeholder="12,99" defaultValue={w?.priceCents != null ? (w.priceCents / 100).toFixed(2).replace(".", ",") : ""} />
        </Field>
        <Field label="Priorität">
          <select className={inputCls} name="priority" defaultValue={w?.priority ?? 2}>
            {[1, 2, 3].map((p) => (
              <option key={p} value={p}>{wishPriorityLabels[p]}</option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Anlass">
        <select className={inputCls} name="occasion" defaultValue={w?.occasion ?? "ANY"}>
          {OCCASIONS.map((o) => (
            <option key={o} value={o}>{occasionLabels[o]}</option>
          ))}
        </select>
      </Field>
      <Field label="Bild-Link (optional, nur https://, wird nur verlinkt)">
        <input className={inputCls} type="url" name="imageUrl" maxLength={2000} pattern="https://.*" placeholder="https://" defaultValue={w?.imageUrl ?? ""} />
      </Field>
      <Field label="Notiz (optional, z. B. Größe oder Farbe)">
        <input className={inputCls} name="note" maxLength={500} defaultValue={w?.note ?? ""} />
      </Field>
    </>
  );
}
