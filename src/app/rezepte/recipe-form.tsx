"use client";

import { useActionState, useState } from "react";
import { parseIngredientLine, RECIPE_LIMITS as L } from "@/lib/recipes";
import type { RecipeDraft } from "@/lib/recipe-extract";
import { importRecipeAction, type ImportState } from "../rezepte-actions";
import { buttonCls, Field, ghostButtonCls, inputCls } from "../ui";

export interface RecipeFormValue extends RecipeDraft {
  allergens: string | null;
}

interface Row {
  key: number;
  quantity: string;
  unit: string;
  name: string;
}

let nextKey = 1;
const toRow = (i: { quantity: number | null; unit: string | null; name: string }): Row => ({
  key: nextKey++,
  quantity: i.quantity === null ? "" : String(Number(i.quantity.toFixed(3))).replace(".", ","),
  unit: i.unit ?? "",
  name: i.name,
});

/** "1,5", "1.5", "1/2", "½" to a number; empty stays null. */
function quantityOf(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const p = parseIngredientLine(`${t} x`);
  return p.quantity;
}

export function RecipeForm({
  action,
  initial,
  recipeId,
  submitLabel,
}: {
  action: (form: FormData) => Promise<void>;
  initial?: Partial<RecipeFormValue>;
  recipeId?: string;
  submitLabel: string;
}) {
  const [rows, setRows] = useState<Row[]>(() => (initial?.ingredients?.length ? initial.ingredients.map(toRow) : [toRow({ quantity: null, unit: null, name: "" })]));
  const [steps, setSteps] = useState<string>((initial?.steps ?? []).join("\n\n"));

  function payload(form: HTMLFormElement): string {
    const v = (n: string) => (form.elements.namedItem(n) as HTMLInputElement | null)?.value ?? "";
    const num = (n: string) => (v(n).trim() ? Number(v(n)) : null);
    return JSON.stringify({
      title: v("title"),
      description: v("description"),
      servings: num("servings"),
      prepMinutes: num("prepMinutes"),
      ingredients: rows.filter((r) => r.name.trim()).map((r) => ({ quantity: quantityOf(r.quantity), unit: r.unit, name: r.name })),
      steps: steps.split(/\n\s*\n|\r?\n/).map((s) => s.trim()).filter(Boolean),
      tags: v("tags").split(",").map((s) => s.trim()).filter(Boolean),
      allergens: v("allergens"),
      imageUrl: v("imageUrl"),
      sourceUrl: v("sourceUrl"),
    });
  }

  const update = (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  return (
    <form
      action={action}
      onSubmit={(e) => {
        const f = e.currentTarget;
        (f.elements.namedItem("payload") as HTMLInputElement).value = payload(f);
      }}
    >
      <input type="hidden" name="payload" />
      {recipeId ? <input type="hidden" name="recipeId" value={recipeId} /> : null}
      <Field label="Titel">
        <input className={inputCls} name="title" maxLength={L.title} defaultValue={initial?.title} required />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Portionen">
          <input className={inputCls} type="number" name="servings" min={1} max={1000} defaultValue={initial?.servings ?? ""} />
        </Field>
        <Field label="Zeit (Minuten)">
          <input className={inputCls} type="number" name="prepMinutes" min={1} max={100000} defaultValue={initial?.prepMinutes ?? ""} />
        </Field>
      </div>
      <Field label="Beschreibung (optional)">
        <textarea className={inputCls} name="description" rows={2} maxLength={L.description} defaultValue={initial?.description ?? ""} />
      </Field>

      <fieldset className="mb-4">
        <legend className="mb-1 text-sm font-medium">Zutaten</legend>
        <ul className="space-y-2">
          {rows.map((r, i) => (
            <li key={r.key} className="grid grid-cols-[4.5rem_4.5rem_minmax(0,1fr)_2.75rem] gap-2" data-testid="ingredient-row">
              <input className={inputCls} aria-label={`Menge ${i + 1}`} inputMode="decimal" placeholder="Menge" value={r.quantity} maxLength={12} onChange={(e) => update(r.key, { quantity: e.target.value })} />
              <input className={inputCls} aria-label={`Einheit ${i + 1}`} placeholder="g" value={r.unit} maxLength={L.unit} onChange={(e) => update(r.key, { unit: e.target.value })} />
              <input className={inputCls} aria-label={`Zutat ${i + 1}`} placeholder="Zutat" value={r.name} maxLength={L.ingredientName} onChange={(e) => update(r.key, { name: e.target.value })} />
              <button type="button" className="min-h-11 rounded-xl border border-stone-300 text-stone-600 hover:bg-stone-50" aria-label={`Zutat ${i + 1} entfernen`} onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((x) => x.key !== r.key) : [toRow({ quantity: null, unit: null, name: "" })]))}>
                ×
              </button>
            </li>
          ))}
        </ul>
        {rows.length < L.ingredients ? (
          <button type="button" className={`${ghostButtonCls} mt-2`} onClick={() => setRows((rs) => [...rs, toRow({ quantity: null, unit: null, name: "" })])}>
            Zutat hinzufügen
          </button>
        ) : null}
      </fieldset>

      <Field label="Zubereitung (ein Schritt je Absatz)">
        <textarea className={inputCls} name="steps" rows={6} value={steps} onChange={(e) => setSteps(e.target.value)} />
      </Field>
      <Field label="Tags (mit Komma getrennt, optional)">
        <input className={inputCls} name="tags" defaultValue={(initial?.tags ?? []).join(", ")} />
      </Field>
      <Field label="Allergene und Hinweise (optional)">
        <input className={inputCls} name="allergens" maxLength={L.allergens} defaultValue={initial?.allergens ?? ""} />
      </Field>
      <Field label="Bild-Link (optional, https)">
        <input className={inputCls} type="url" name="imageUrl" maxLength={L.url} placeholder="https://" defaultValue={initial?.imageUrl ?? ""} />
      </Field>
      <Field label="Quelle (optional, https)">
        <input className={inputCls} type="url" name="sourceUrl" maxLength={L.url} placeholder="https://" defaultValue={initial?.sourceUrl ?? ""} />
      </Field>
      <button className={buttonCls}>{submitLabel}</button>
    </form>
  );
}

/** URL import: fetches a draft on the server (nothing saved), then shows it in the form for correction. */
export function ImportAndForm({ action }: { action: (form: FormData) => Promise<void> }) {
  const [state, importAction, pending] = useActionState<ImportState, FormData>(importRecipeAction, { status: "idle" });
  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200">
        <h2 className="mb-3 text-lg font-semibold">Von einer Webseite übernehmen</h2>
        <form action={importAction}>
          <Field label="Adresse des Rezepts (https)">
            <input className={inputCls} type="url" name="url" required maxLength={2000} placeholder="https://" />
          </Field>
          <button className={ghostButtonCls} disabled={pending}>{pending ? "Wird gelesen …" : "Rezept einlesen"}</button>
        </form>
        {state.status === "error" ? (
          <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800 ring-1 ring-red-200">{state.message}</p>
        ) : null}
        {state.status === "ok" ? (
          <p role="status" className="mt-3 rounded-xl bg-green-50 px-3 py-2 text-sm text-green-800 ring-1 ring-green-200">
            Rezept eingelesen, aber noch nicht gespeichert. Bitte prüfe und korrigiere es unten. Die Quelle bleibt verlinkt; Texte und Bilder der Seite gehören ihren Urhebern und werden nur in eurer Familie gespeichert.
          </p>
        ) : null}
      </section>
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200">
        <h2 className="mb-3 text-lg font-semibold">{state.status === "ok" ? "Vorschau prüfen" : "Rezept eintragen"}</h2>
        <RecipeForm
          key={state.status === "ok" ? `import-${state.n}` : "leer"}
          action={action}
          initial={state.status === "ok" ? { ...state.draft, allergens: null } : undefined}
          submitLabel="Rezept speichern"
        />
      </section>
    </div>
  );
}
