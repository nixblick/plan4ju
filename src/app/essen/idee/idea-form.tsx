"use client";

import { useActionState } from "react";
import { recipeIdeaAction, type IdeaState } from "../../essen-actions";
import { RecipeForm } from "../../rezepte/recipe-form";
import { Field, ghostButtonCls, inputCls } from "../../ui";

/** Wish form: only these fields go to the AI provider. The answer is an unsaved draft in the recipe form. */
export function IdeaAndForm({ action }: { action: (form: FormData) => Promise<void> }) {
  const [state, ask, pending] = useActionState<IdeaState, FormData>(recipeIdeaAction, { status: "idle" });
  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200">
        <h2 className="mb-3 text-lg font-semibold">Was soll es geben?</h2>
        <form action={ask}>
          <Field label="Stichwörter oder vorhandene Zutaten">
            <input className={inputCls} name="wishes" required minLength={2} maxLength={300} placeholder="z. B. Kartoffeln, Spinat, schnell" />
          </Field>
          <Field label="Ohne (Allergene, Zutaten, optional)">
            <input className={inputCls} name="exclude" maxLength={200} placeholder="z. B. Nüsse, Milch" />
          </Field>
          <Field label="Ernährungsweise (optional)">
            <input className={inputCls} name="diet" maxLength={60} placeholder="z. B. vegetarisch" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Höchstens Minuten">
              <input className={inputCls} type="number" name="maxMinutes" min={5} max={600} />
            </Field>
            <Field label="Portionen">
              <input className={inputCls} type="number" name="servings" min={1} max={20} />
            </Field>
          </div>
          <p className="mb-3 text-xs text-stone-600">An den KI-Dienst gehen nur diese Angaben, keine Namen und keine Daten eurer Familie.</p>
          <button className={ghostButtonCls} disabled={pending}>{pending ? "Wird überlegt …" : "Idee holen"}</button>
        </form>
        {state.status === "error" ? (
          <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800 ring-1 ring-red-200">{state.message}</p>
        ) : null}
        {state.status === "ok" ? (
          <p role="status" className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200">
            Vorschlag einer KI, noch nicht gespeichert. Bitte prüfe Mengen und Zubereitung. Allergenangaben sind ohne Gewähr: Prüfe Zutaten und mögliche Kreuzkontamination vor dem Verzehr selbst.
          </p>
        ) : null}
      </section>
      {state.status === "ok" ? (
        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200">
          <h2 className="mb-3 text-lg font-semibold">Entwurf prüfen</h2>
          <RecipeForm key={`idee-${state.n}`} action={action} initial={state.draft} submitLabel="Als Rezept speichern" />
        </section>
      ) : null}
    </div>
  );
}
