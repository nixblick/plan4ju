import Link from "next/link";
import { errorMessages, okMessages, one } from "@/lib/messages";
import { SHOPPING_LIMITS as L } from "@/lib/shopping";
import { getShoppingList } from "@/server/services/shopping";
import { requireFamily } from "@/server/session";
import { addShopAction, deleteShopAction, moveShopAction, renameShopAction } from "../../einkauf-actions";
import { buttonCls, Card, ghostButtonCls, inputCls, Notice } from "../../ui";

export const dynamic = "force-dynamic";

export default async function Geschaefte({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { user, familyId } = await requireFamily();
  const sp = await searchParams;
  const fehler = one(sp.fehler);
  const ok = one(sp.ok);
  const { shops } = await getShoppingList(user.id, familyId);
  return (
    <div className="space-y-5">
      <Link href="/einkauf" className="text-sm text-terracotta-dark underline">← Einkaufsliste</Link>
      <h1 className="text-2xl font-bold">Geschäfte</h1>
      {fehler ? <Notice kind="error">{errorMessages[fehler] ?? "Das hat nicht geklappt."}</Notice> : null}
      {ok ? <Notice kind="ok">{okMessages[ok] ?? "Gespeichert."}</Notice> : null}
      <Card title="Reihenfolge und Namen">
        <p className="mb-3 text-sm text-stone-600">In dieser Reihenfolge erscheinen die Geschäfte auf der Liste. Ein Eintrag kann mehreren Geschäften gehören.</p>
        <ul className="space-y-3">
          {shops.map((s, i) => (
            <li key={s.id} className="rounded-xl bg-stone-50 p-3" data-testid="shop-row">
              <form action={renameShopAction} className="flex gap-2">
                <input type="hidden" name="shopId" value={s.id} />
                <input name="name" aria-label={`Name von ${s.name}`} defaultValue={s.name} maxLength={L.shopName} required className={`${inputCls} min-w-0`} />
                <button className={ghostButtonCls}>Speichern</button>
              </form>
              <div className="mt-2 flex flex-wrap gap-2">
                {i > 0 ? (
                  <form action={moveShopAction}>
                    <input type="hidden" name="shopId" value={s.id} />
                    <input type="hidden" name="dir" value="up" />
                    <button className={ghostButtonCls} aria-label={`${s.name} nach oben`}>↑ Nach oben</button>
                  </form>
                ) : null}
                {shops.length > 1 ? (
                  <form action={deleteShopAction}>
                    <input type="hidden" name="shopId" value={s.id} />
                    <button className={ghostButtonCls} aria-label={`${s.name} entfernen`}>Entfernen</button>
                  </form>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </Card>
      {shops.length < L.shops ? (
        <Card title="Geschäft hinzufügen">
          <form action={addShopAction} className="flex gap-2">
            <input name="name" aria-label="Name des Geschäfts" maxLength={L.shopName} required className={`${inputCls} min-w-0`} placeholder="z. B. Wochenmarkt" />
            <button className={buttonCls}>Hinzufügen</button>
          </form>
        </Card>
      ) : null}
    </div>
  );
}
