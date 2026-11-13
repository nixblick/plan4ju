import Link from "next/link";
import { errorMessages, okMessages, one } from "@/lib/messages";
import { daysBetween, todayIn } from "@/lib/week";
import { inDaysText, nextListOccasion, occasionLabels } from "@/lib/wishes";
import { listBirthdays } from "@/server/services/birthdays";
import { getDashboard } from "@/server/services/dashboard";
import { listProfiles } from "@/server/services/members";
import { listWishlists } from "@/server/services/wishes";
import { requireFamily } from "@/server/session";
import { FesteTabs } from "../geburtstage/tabs";
import { buttonCls, Card, Notice } from "../ui";
import { createWishlistAction } from "../wunsch-actions";
import { ListFields } from "./list-fields";
import { pageModule } from "@/server/active-modules";

export const dynamic = "force-dynamic";


export default async function Wuensche({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await pageModule("wishes");
  const { user, familyId } = await requireFamily();
  const sp = await searchParams;
  const fehler = one(sp.fehler);
  const ok = one(sp.ok);
  const [dash, lists, profiles, birthdays] = await Promise.all([
    getDashboard(user.id, familyId),
    listWishlists(user.id, familyId),
    listProfiles(user.id, familyId),
    listBirthdays(user.id, familyId),
  ]);
  const today = todayIn(dash.timezone);
  const rows = lists
    .map((l) => ({ l, next: nextListOccasion(l.wishes.map((w) => w.occasion), today, l.birthday) }))
    .sort((a, b) => (a.next?.date ?? "9999").localeCompare(b.next?.date ?? "9999") || a.l.ownerName.localeCompare(b.l.ownerName, "de"));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Wunschzettel</h1>
      <FesteTabs active="wuensche" />
      {fehler ? <Notice kind="error">{errorMessages[fehler] ?? "Das hat nicht geklappt."}</Notice> : null}
      {ok ? <Notice kind="ok">{okMessages[ok] ?? "Gespeichert."}</Notice> : null}

      <Card title="Alle Wunschzettel">
        {rows.length === 0 ? (
          <p className="text-stone-600">Noch keine Wunschzettel. Leg unten den ersten an.</p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {rows.map(({ l, next }) => {
              const open = l.wishes.filter((w) => !w.received).length;
              return (
                <li key={l.id} data-testid="wishlist-row">
                  <Link href={`/wuensche/${l.id}`} className="block min-h-11 py-3">
                    <span className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="min-w-0 break-words font-medium text-terracotta-dark underline">{l.title}</span>
                      <span className="text-sm text-stone-600">{open} {open === 1 ? "Wunsch" : "Wünsche"}</span>
                    </span>
                    <span className="block text-sm text-stone-600">
                      für {l.ownerName}
                      {l.visibility === "PRIVATE" ? " · nur für dich sichtbar" : ""}
                      {next ? ` · ${occasionLabels[next.occasion]} ${inDaysText(daysBetween(today, next.date))}` : ""}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card title="Neuer Wunschzettel">
        <form action={createWishlistAction}>
          <ListFields profiles={profiles} birthdays={birthdays} />
          <button className={buttonCls}>Wunschzettel anlegen</button>
        </form>
      </Card>
    </div>
  );
}
