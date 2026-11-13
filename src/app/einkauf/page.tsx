import Link from "next/link";
import { errorMessages, okMessages, one } from "@/lib/messages";
import { formatQuantity } from "@/lib/recipes";
import { SHOPPING_LIMITS as L } from "@/lib/shopping";
import { getShoppingList, type ShoppingItemView } from "@/server/services/shopping";
import { requireFamily } from "@/server/session";
import { clearDoneAction, deleteItemAction, purgeClearedAction, saveItemAction, toggleItemAction } from "../einkauf-actions";
import { EssenTabs } from "../essen/tabs";
import { buttonCls, Card, ghostButtonCls, inputCls, Notice } from "../ui";
import { RefreshButton } from "./refresh";

export const dynamic = "force-dynamic";

type Shop = { id: string; name: string };

const amount = (i: ShoppingItemView) => [formatQuantity(i.quantity), i.unit].filter(Boolean).join(" ");

function ItemFields({ item, shops, filter }: { item?: ShoppingItemView; shops: Shop[]; filter: string }) {
  const p = item ? `e-${item.id}-` : "neu-";
  return (
    <>
      {filter ? <input type="hidden" name="filter" value={filter} /> : null}
      {item ? <input type="hidden" name="itemId" value={item.id} /> : null}
      <div className="grid grid-cols-[5rem_5rem_minmax(0,1fr)] gap-2">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Menge</span>
          <input id={`${p}q`} name="quantity" inputMode="decimal" maxLength={10} defaultValue={item ? formatQuantity(item.quantity) : ""} className={inputCls} />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Einheit</span>
          <input name="unit" maxLength={L.unit} defaultValue={item?.unit ?? ""} className={inputCls} />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Artikel</span>
          <input name="name" required maxLength={L.name} defaultValue={item?.name ?? ""} className={inputCls} />
        </label>
      </div>
      <label className="block">
        <span className="mb-1 block text-sm font-medium">Notiz</span>
        <input name="note" maxLength={L.note} defaultValue={item?.note ?? ""} className={inputCls} />
      </label>
      <fieldset>
        <legend className="mb-1 text-sm font-medium">Geschäfte</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {shops.map((s) => (
            <label key={s.id} className="inline-flex min-h-11 items-center gap-2 text-sm">
              <input type="checkbox" name="shopIds" value={s.id} defaultChecked={item ? item.shopIds.includes(s.id) : s.id === filter} className="h-5 w-5" />
              {s.name}
            </label>
          ))}
        </div>
      </fieldset>
    </>
  );
}

function Row({ item, shops, filter }: { item: ShoppingItemView; shops: Shop[]; filter: string }) {
  const shopNames = shops.filter((s) => item.shopIds.includes(s.id)).map((s) => s.name);
  return (
    <li className="border-b border-stone-100 py-2 last:border-0" data-testid={item.done || item.cleared ? "done-item" : "open-item"}>
      <div className="flex items-start gap-3">
        <form action={toggleItemAction}>
          {filter ? <input type="hidden" name="filter" value={filter} /> : null}
          <input type="hidden" name="itemId" value={item.id} />
          <input type="hidden" name="done" value={item.done ? "0" : "1"} />
          <button
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border text-lg ${item.done ? "border-green-600 bg-green-50 text-green-700" : "border-stone-300 bg-white"}`}
            aria-label={item.done ? `${item.name} wiederherstellen` : `${item.name} abhaken`}
          >
            {item.done ? "✓" : ""}
          </button>
        </form>
        <div className="min-w-0 flex-1 pt-2">
          <p className={`break-words ${item.done ? "text-stone-500 line-through" : ""}`}>
            {amount(item) ? <span className="font-medium tabular-nums">{amount(item)} </span> : null}
            <span data-testid="item-name">{item.name}</span>
          </p>
          {item.note ? <p className="break-words text-sm text-stone-600">{item.note}</p> : null}
          <p className="break-words text-xs text-stone-500">
            {[shopNames.length ? shopNames.join(", ") : null, item.fromRecipes.length ? `aus Rezept ${item.fromRecipes.map((t) => `„${t}“`).join(", ")}` : null].filter(Boolean).join(" · ")}
          </p>
        </div>
      </div>
      {!item.done ? (
        <details className="ml-14 mt-1">
          <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm underline">Bearbeiten</summary>
          <form action={saveItemAction} className="mt-2 space-y-3 rounded-xl bg-stone-50 p-3">
            <ItemFields item={item} shops={shops} filter={filter} />
            <button className={buttonCls}>Speichern</button>
          </form>
          <form action={deleteItemAction} className="mt-2">
            {filter ? <input type="hidden" name="filter" value={filter} /> : null}
            <input type="hidden" name="itemId" value={item.id} />
            <button className={ghostButtonCls}>Löschen</button>
          </form>
        </details>
      ) : null}
    </li>
  );
}

export default async function Einkauf({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { user, familyId } = await requireFamily();
  const sp = await searchParams;
  const fehler = one(sp.fehler);
  const ok = one(sp.ok);
  const wanted = one(sp.laden) ?? "";
  const all = await getShoppingList(user.id, familyId);
  const shop = all.shops.find((s) => s.id === wanted);
  const filter = shop?.id ?? "";
  const list = shop ? await getShoppingList(user.id, familyId, { shopId: shop.id }) : all;

  // Without a filter the open entries are grouped by their first shop in shop order.
  const groups = shop
    ? [{ key: shop.id, name: shop.name, items: list.open }]
    : [
        ...all.shops.map((s) => ({ key: s.id, name: s.name, items: list.open.filter((i) => all.shops.find((x) => i.shopIds.includes(x.id))?.id === s.id) })),
        { key: "ohne", name: "Ohne Geschäft", items: list.open.filter((i) => i.shopIds.length === 0) },
      ].filter((g) => g.items.length);

  return (
    <div className="space-y-5">
      <EssenTabs active="einkauf" />
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Einkaufsliste</h1>
        <RefreshButton />
      </div>
      {fehler ? <Notice kind="error">{errorMessages[fehler] ?? "Das hat nicht geklappt."}</Notice> : null}
      {ok ? <Notice kind="ok">{okMessages[ok] ?? "Gespeichert."}</Notice> : null}

      <nav aria-label="Geschäft wählen" className="flex flex-wrap gap-2 text-sm">
        <Link href="/einkauf" aria-current={!shop ? "page" : undefined} className={`inline-flex min-h-11 items-center rounded-full px-3 ${!shop ? "bg-terracotta text-white" : "bg-stone-100"}`}>Alle</Link>
        {all.shops.map((s) => (
          <Link key={s.id} href={`/einkauf?laden=${s.id}`} aria-current={s.id === filter ? "page" : undefined} className={`inline-flex min-h-11 items-center rounded-full px-3 ${s.id === filter ? "bg-terracotta text-white" : "bg-stone-100"}`}>
            {s.name}
          </Link>
        ))}
        <Link href="/einkauf/geschaefte" className="inline-flex min-h-11 items-center px-2 underline">Geschäfte verwalten</Link>
      </nav>

      <details className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200">
        <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold">+ Eintrag hinzufügen</summary>
        <form action={saveItemAction} className="mt-3 space-y-3">
          <ItemFields shops={all.shops} filter={filter} />
          <button className={buttonCls}>Auf die Liste</button>
        </form>
      </details>

      <Card title={`Offen (${list.open.length})`}>
        {groups.length === 0 ? (
          <p className="text-stone-600">Nichts zu kaufen. Zutaten kommen über ein Rezept oder den Wochenplan auf die Liste.</p>
        ) : (
          groups.map((g) => (
            <section key={g.key} className="mb-3 last:mb-0" data-testid="shop-group">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-stone-500">{g.name}</h3>
              <ul>{g.items.map((i) => <Row key={i.id} item={i} shops={all.shops} filter={filter} />)}</ul>
            </section>
          ))
        )}
      </Card>

      {list.done.length ? (
        <Card title={`Erledigt (${list.done.length})`}>
          <ul>{list.done.map((i) => <Row key={i.id} item={i} shops={all.shops} filter={filter} />)}</ul>
          <form action={clearDoneAction} className="mt-3">
            {filter ? <input type="hidden" name="filter" value={filter} /> : null}
            <button className={ghostButtonCls}>Erledigte wegräumen</button>
          </form>
        </Card>
      ) : null}

      {list.cleared.length ? (
        <details className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200">
          <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold">Weggeräumt ({list.cleared.length})</summary>
          <ul className="mt-2">
            {list.cleared.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-3 border-b border-stone-100 py-2 last:border-0" data-testid="cleared-item">
                <span className="min-w-0 break-words text-stone-600">{[amount(i), i.name].filter(Boolean).join(" ")}</span>
                <form action={toggleItemAction}>
                  {filter ? <input type="hidden" name="filter" value={filter} /> : null}
                  <input type="hidden" name="itemId" value={i.id} />
                  <input type="hidden" name="done" value="0" />
                  <button className={ghostButtonCls} aria-label={`${i.name} wiederherstellen`}>Wiederherstellen</button>
                </form>
              </li>
            ))}
          </ul>
          <form action={purgeClearedAction} className="mt-3">
            {filter ? <input type="hidden" name="filter" value={filter} /> : null}
            <button className={ghostButtonCls}>Endgültig löschen</button>
          </form>
        </details>
      ) : null}
    </div>
  );
}
