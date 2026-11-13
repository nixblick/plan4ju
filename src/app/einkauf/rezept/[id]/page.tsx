import Link from "next/link";
import { notFound } from "next/navigation";
import { errorMessages, one } from "@/lib/messages";
import { formatQuantity, scaleQuantity } from "@/lib/recipes";
import { SHOPPING_LIMITS as L } from "@/lib/shopping";
import { NotFoundError } from "@/server/errors";
import { getRecipe } from "@/server/services/recipes";
import { getShoppingList } from "@/server/services/shopping";
import { requireFamily } from "@/server/session";
import { transferAction } from "../../../einkauf-actions";
import { buttonCls, Card, inputCls, Notice } from "../../../ui";

export const dynamic = "force-dynamic";

/** Preview before the transfer: choose ingredients, adjust quantity, unit and shop. */
export default async function ZutatenEinkaufen({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { user, familyId } = await requireFamily();
  const { id } = await params;
  const sp = await searchParams;
  const fehler = one(sp.fehler);
  let r;
  try {
    r = await getRecipe(user.id, familyId, id);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
  const { shops, open } = await getShoppingList(user.id, familyId);
  const onList = new Set(open.map((i) => i.name.trim().toLowerCase()));
  const wanted = Number(one(sp.portionen));
  const portions = Number.isInteger(wanted) && wanted >= 1 && wanted <= 100 ? wanted : r.servings;

  return (
    <div className="space-y-5">
      <Link href={`/rezepte/${r.id}`} className="text-sm text-terracotta-dark underline">← Zum Rezept</Link>
      <h1 className="break-words text-2xl font-bold">Zutaten einkaufen: {r.title}</h1>
      {fehler ? <Notice kind="error">{errorMessages[fehler] ?? "Das hat nicht geklappt."}</Notice> : null}
      {r.ingredients.length === 0 ? (
        <Card><p className="text-stone-600">Dieses Rezept hat keine Zutaten.</p></Card>
      ) : (
        <form action={transferAction} className="space-y-4">
          <input type="hidden" name="recipeId" value={r.id} />
          {r.servings ? <p className="text-sm text-stone-600">Mengen für {portions} Portionen{portions !== r.servings ? ` (Original: ${r.servings})` : ""}. Gleiche Zutaten, die schon offen auf der Liste stehen, werden zusammengeführt.</p> : null}
          <ul className="space-y-3">
            {r.ingredients.map((i, n) => (
              <li key={i.id} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-200" data-testid="transfer-row">
                <label className="flex min-h-11 items-center gap-3">
                  <input type="checkbox" name="take" value={i.id} defaultChecked className="h-5 w-5" />
                  <span className="min-w-0 break-words font-medium">{i.name}</span>
                  {onList.has(i.name.trim().toLowerCase()) ? <span className="text-xs text-stone-500">(steht schon auf der Liste)</span> : null}
                </label>
                <div className="mt-2 grid grid-cols-[5rem_5rem_minmax(0,1fr)] gap-2">
                  <input name={`q-${i.id}`} aria-label={`Menge ${n + 1}`} inputMode="decimal" maxLength={10} defaultValue={formatQuantity(scaleQuantity(i.quantity, r.servings, portions))} className={inputCls} />
                  <input name={`u-${i.id}`} aria-label={`Einheit ${n + 1}`} maxLength={L.unit} defaultValue={i.unit ?? ""} className={inputCls} />
                  <select name={`s-${i.id}`} aria-label={`Geschäft ${n + 1}`} defaultValue={shops[0]?.id ?? ""} className={inputCls}>
                    <option value="">Ohne Geschäft</option>
                    {shops.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              </li>
            ))}
          </ul>
          <button className={buttonCls}>Ausgewählte auf die Einkaufsliste</button>
        </form>
      )}
    </div>
  );
}
