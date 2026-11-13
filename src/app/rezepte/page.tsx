import Link from "next/link";
import { errorMessages, okMessages, one } from "@/lib/messages";
import { listRecipes } from "@/server/services/recipes";
import { requireFamily } from "@/server/session";
import { buttonCls, Card, Notice } from "../ui";

export const dynamic = "force-dynamic";

export default async function Rezepte({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { user, familyId } = await requireFamily();
  const sp = await searchParams;
  const fehler = one(sp.fehler);
  const ok = one(sp.ok);
  const q = (one(sp.q) ?? "").trim().toLowerCase().slice(0, 100);
  const all = await listRecipes(user.id, familyId);
  const list = q ? all.filter((r) => r.title.toLowerCase().includes(q) || r.tags.some((t) => t.toLowerCase().includes(q))) : all;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Rezepte</h1>
        <Link href="/rezepte/neu" className={buttonCls}>Neues Rezept</Link>
      </div>
      {fehler ? <Notice kind="error">{errorMessages[fehler] ?? "Das hat nicht geklappt."}</Notice> : null}
      {ok ? <Notice kind="ok">{okMessages[ok] ?? "Gespeichert."}</Notice> : null}
      <Card>
        <form className="mb-4 flex gap-2" role="search">
          <input name="q" defaultValue={q} placeholder="Suchen nach Titel oder Tag" aria-label="Rezepte suchen" className="min-w-0 flex-1 rounded-xl border border-stone-300 px-3 py-2.5" />
          <button className="min-h-11 rounded-xl border border-stone-300 px-4">Suchen</button>
        </form>
        {list.length === 0 ? (
          <p className="text-stone-600">{all.length === 0 ? "Noch keine Rezepte. Lege eins an oder übernimm es von einer Webseite." : "Kein Rezept passt zur Suche."}</p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {list.map((r) => (
              <li key={r.id} data-testid="recipe-row">
                <Link href={`/rezepte/${r.id}`} className="block py-3">
                  <span className="block break-words font-medium">{r.title}</span>
                  <span className="text-sm text-stone-600">
                    {[r.servings ? `${r.servings} Portionen` : null, r.prepMinutes ? `${r.prepMinutes} Min.` : null, ...r.tags.slice(0, 3)].filter(Boolean).join(" · ")}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
