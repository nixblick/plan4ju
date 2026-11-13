import Link from "next/link";
import { notFound } from "next/navigation";
import { errorMessages, okMessages, one } from "@/lib/messages";
import { formatQuantity, scaleQuantity } from "@/lib/recipes";
import { NotFoundError } from "@/server/errors";
import { getRecipe } from "@/server/services/recipes";
import { requireFamily } from "@/server/session";
import { deleteRecipeAction, updateRecipeAction } from "../../rezepte-actions";
import { Card, ghostButtonCls, inputCls, Notice } from "../../ui";
import { RecipeForm } from "../recipe-form";

export const dynamic = "force-dynamic";

export default async function Rezept({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { user, familyId } = await requireFamily();
  const { id } = await params;
  const sp = await searchParams;
  const fehler = one(sp.fehler);
  const ok = one(sp.ok);
  let r;
  try {
    r = await getRecipe(user.id, familyId, id);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
  const wanted = Number(one(sp.portionen));
  const portions = Number.isInteger(wanted) && wanted >= 1 && wanted <= 100 ? wanted : r.servings;
  const scaled = r.servings && portions && portions !== r.servings;

  return (
    <div className="space-y-6">
      <Link href="/rezepte" className="text-sm text-terracotta-dark underline">← Alle Rezepte</Link>
      <h1 className="break-words text-2xl font-bold">{r.title}</h1>
      {fehler ? <Notice kind="error">{fehler === "eingabe-plan" ? "Bitte prüfe deine Eingaben (Titel fehlt, Menge oder Link ungültig; Links nur mit https)." : errorMessages[fehler] ?? "Das hat nicht geklappt."}</Notice> : null}
      {ok ? <Notice kind="ok">{okMessages[ok] ?? "Gespeichert."}</Notice> : null}

      <Card>
        <p className="text-sm text-stone-600">
          {[r.prepMinutes ? `${r.prepMinutes} Minuten` : null, ...r.tags].filter(Boolean).join(" · ") || "Keine Angaben zu Zeit und Tags."}
        </p>
        {r.description ? <p className="mt-2 whitespace-pre-line break-words">{r.description}</p> : null}
        {r.allergens ? (
          <p className="mt-2 text-sm text-stone-700">
            <span className="font-medium">Hinweise:</span> {r.allergens} <span className="text-stone-600">(ohne Gewähr; Zutaten und mögliche Spuren vor dem Essen selbst prüfen)</span>
          </p>
        ) : null}
        {r.sourceUrl || r.imageUrl ? (
        <p className="mt-2 flex flex-wrap gap-x-4 text-sm">
          {r.sourceUrl ? <a className="break-all text-terracotta-dark underline" href={r.sourceUrl} target="_blank" rel="noopener noreferrer nofollow">Quelle öffnen</a> : null}
          {r.imageUrl ? <a className="text-terracotta-dark underline" href={r.imageUrl} target="_blank" rel="noopener noreferrer nofollow">Bild ansehen</a> : null}
        </p>
        ) : null}
      </Card>

      <Card title="Zutaten">
        {r.servings ? (
          <form className="mb-3 flex flex-wrap items-center gap-2" aria-label="Portionen umrechnen">
            <label htmlFor="portionen" className="text-sm">Für</label>
            <input id="portionen" name="portionen" type="number" min={1} max={100} defaultValue={portions ?? ""} className={`${inputCls} w-20`} />
            <span className="text-sm">Portionen</span>
            <button className={ghostButtonCls}>Umrechnen</button>
            {scaled ? <span className="text-sm text-stone-600">(Original: {r.servings})</span> : null}
          </form>
        ) : (
          <p className="mb-3 text-sm text-stone-600">Ohne Portionsangabe kann nicht umgerechnet werden.</p>
        )}
        {r.ingredients.length === 0 ? (
          <p className="text-stone-600">Keine Zutaten eingetragen.</p>
        ) : (
          <ul className="space-y-1" data-testid="ingredients">
            {r.ingredients.map((i) => (
              <li key={i.id} className="flex gap-2" data-testid="ingredient">
                <span className="w-24 shrink-0 text-right font-medium tabular-nums">
                  {[formatQuantity(scaleQuantity(i.quantity, r.servings, portions)), i.unit].filter(Boolean).join(" ")}
                </span>
                <span className="min-w-0 break-words">{i.name}</span>
              </li>
            ))}
          </ul>
        )}
        {r.ingredients.length ? (
          <Link href={`/einkauf/rezept/${r.id}${scaled ? `?portionen=${portions}` : ""}`} className="mt-3 inline-flex min-h-11 items-center font-medium text-terracotta-dark underline">
            Zutaten auf die Einkaufsliste …
          </Link>
        ) : null}
      </Card>

      {r.steps.length ? (
        <Card title="Zubereitung">
          <ol className="list-decimal space-y-2 pl-5">
            {r.steps.map((s, n) => <li key={n} className="break-words">{s}</li>)}
          </ol>
        </Card>
      ) : null}

      <details className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200">
        <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold">Bearbeiten</summary>
        <div className="mt-3">
          <RecipeForm action={updateRecipeAction} recipeId={r.id} initial={r} submitLabel="Änderungen speichern" />
        </div>
      </details>
      <form action={deleteRecipeAction}>
        <input type="hidden" name="recipeId" value={r.id} />
        <button className={ghostButtonCls}>Rezept löschen</button>
      </form>
    </div>
  );
}
