import Link from "next/link";
import { notFound } from "next/navigation";
import { errorMessages, okMessages, one } from "@/lib/messages";
import { daysBetween, todayIn } from "@/lib/week";
import { formatPrice, inDaysText, nextListOccasion, nextOccasion, occasionLabels, wishPriorityLabels } from "@/lib/wishes";
import { NotFoundError } from "@/server/errors";
import { listBirthdays } from "@/server/services/birthdays";
import { getDashboard } from "@/server/services/dashboard";
import { listProfiles } from "@/server/services/members";
import { getWishlist, type WishView } from "@/server/services/wishes";
import { requireFamily } from "@/server/session";
import { FesteTabs } from "../../geburtstage/tabs";
import { buttonCls, Card, ghostButtonCls, Notice } from "../../ui";
import {
  createWishAction, deleteWishAction, deleteWishlistAction, releaseWishAction, reserveWishAction, setGivenAction, setWishReceivedAction,
  updateWishAction, updateWishlistAction,
} from "../../wunsch-actions";
import { ListFields, WishFields } from "../list-fields";

export const dynamic = "force-dynamic";

const linkCls = "inline-flex min-h-11 items-center text-sm text-terracotta-dark underline";

function Hidden({ listId, wishId }: { listId: string; wishId?: string }) {
  return (
    <>
      <input type="hidden" name="listId" value={listId} />
      {wishId ? <input type="hidden" name="wishId" value={wishId} /> : null}
    </>
  );
}

function ReservationBox({ w, listId }: { w: WishView; listId: string }) {
  const r = w.reservation;
  if (!r || w.received) return null;
  if (r.state === "reserved-anonymous") return <p className="text-sm text-stone-600">Schon reserviert.</p>;
  if (r.state === "free") {
    return (
      <form action={reserveWishAction}>
        <Hidden listId={listId} wishId={w.id} />
        <button className={ghostButtonCls}>Ich schenke das</button>
      </form>
    );
  }
  if (!r.byMe) return <p className="text-sm text-stone-600">Reserviert von {r.byName ?? "einem anderen Mitglied"}{r.given ? " · verschenkt" : ""}</p>;
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-green-800">Von dir reserviert{r.given ? " · verschenkt" : ""}</p>
      <div className="flex flex-wrap gap-2">
        <form action={setGivenAction}>
          <Hidden listId={listId} wishId={w.id} />
          <input type="hidden" name="given" value={r.given ? "0" : "1"} />
          <button className={ghostButtonCls}>{r.given ? "Doch nicht verschenkt" : "Verschenkt"}</button>
        </form>
        <form action={releaseWishAction}>
          <Hidden listId={listId} wishId={w.id} />
          <button className={ghostButtonCls}>Reservierung aufheben</button>
        </form>
      </div>
    </div>
  );
}

export default async function Wunschzettel({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { user, familyId } = await requireFamily();
  const { id } = await params;
  const sp = await searchParams;
  const fehler = one(sp.fehler);
  const ok = one(sp.ok);
  let list;
  try {
    list = await getWishlist(user.id, familyId, id);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
  const [dash, profiles, birthdays] = await Promise.all([getDashboard(user.id, familyId), listProfiles(user.id, familyId), listBirthdays(user.id, familyId)]);
  const today = todayIn(dash.timezone);
  const next = nextListOccasion(list.wishes.map((w) => w.occasion), today, list.birthday);

  return (
    <div className="space-y-6">
      <h1 className="break-words text-2xl font-bold">{list.title}</h1>
      <FesteTabs active="wuensche" />
      <Link href="/wuensche" className={linkCls}>← Alle Wunschzettel</Link>
      {fehler ? <Notice kind="error">{errorMessages[fehler] ?? "Das hat nicht geklappt."}</Notice> : null}
      {ok ? <Notice kind="ok">{okMessages[ok] ?? "Gespeichert."}</Notice> : null}

      <Card>
        <p className="text-stone-700">
          Wünsche von <span className="font-medium">{list.ownerName}</span>
          {list.visibility === "PRIVATE" ? " · nur für dich sichtbar" : ""}
        </p>
        {list.description ? <p className="mt-1 break-words text-sm text-stone-600">{list.description}</p> : null}
        {next ? (
          <p className="mt-2 text-sm font-medium" data-testid="next-occasion">
            Nächster Anlass: {occasionLabels[next.occasion]} am {next.date.slice(8, 10)}.{next.date.slice(5, 7)}.{next.date.slice(0, 4)} ({inDaysText(daysBetween(today, next.date))})
          </p>
        ) : null}
        {list.iAmWisher && list.surprise ? (
          <p className="mt-2 rounded-xl bg-orange-50 px-3 py-2 text-sm text-stone-700">Überraschungsmodus: Du siehst nicht, ob jemand etwas für dich reserviert hat.</p>
        ) : null}
      </Card>

      <Card title="Wünsche">
        {list.wishes.length === 0 ? (
          <p className="text-stone-600">Noch keine Wünsche.</p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {list.wishes.map((w) => {
              const when = nextOccasion(w.occasion, today, list.birthday);
              return (
                <li key={w.id} className="space-y-2 py-3" data-testid="wish-row">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className={`min-w-0 break-words font-medium ${w.received ? "text-stone-500 line-through" : ""}`}>{w.title}</span>
                    {w.priceCents != null ? <span className="text-sm text-stone-700">{formatPrice(w.priceCents)}</span> : null}
                  </div>
                  <p className="text-sm text-stone-600">
                    {wishPriorityLabels[w.priority]}
                    {w.occasion !== "ANY" ? ` · ${occasionLabels[w.occasion]}${when ? ` ${inDaysText(daysBetween(today, when))}` : ""}` : ""}
                    {w.received ? " · erhalten" : ""}
                  </p>
                  {w.description ? <p className="break-words text-sm text-stone-700">{w.description}</p> : null}
                  {w.note ? <p className="break-words text-sm text-stone-600">Notiz: {w.note}</p> : null}
                  <div className="flex flex-wrap gap-x-4">
                    {w.url ? (
                      <a href={w.url} target="_blank" rel="noopener noreferrer nofollow" referrerPolicy="no-referrer" className={linkCls}>
                        Zum Angebot ({new URL(w.url).hostname})
                      </a>
                    ) : null}
                    {w.imageUrl ? (
                      <a href={w.imageUrl} target="_blank" rel="noopener noreferrer nofollow" referrerPolicy="no-referrer" className={linkCls}>
                        Bild ansehen
                      </a>
                    ) : null}
                  </div>
                  <ReservationBox w={w} listId={list.id} />
                  {list.canEdit ? (
                    <details>
                      <summary className={`${linkCls} cursor-pointer`}>Bearbeiten</summary>
                      <form action={updateWishAction} className="mt-2">
                        <Hidden listId={list.id} wishId={w.id} />
                        <WishFields w={w} />
                        <button className={buttonCls}>Änderungen speichern</button>
                      </form>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <form action={setWishReceivedAction}>
                          <Hidden listId={list.id} wishId={w.id} />
                          <input type="hidden" name="received" value={w.received ? "0" : "1"} />
                          <button className={ghostButtonCls}>{w.received ? "Doch nicht erhalten" : "Erhalten"}</button>
                        </form>
                        <form action={deleteWishAction}>
                          <Hidden listId={list.id} wishId={w.id} />
                          <button className={ghostButtonCls}>Löschen</button>
                        </form>
                      </div>
                    </details>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {list.canEdit ? (
        <>
          <Card title="Neuer Wunsch">
            <form action={createWishAction}>
              <Hidden listId={list.id} />
              <WishFields />
              <button className={buttonCls}>Wunsch speichern</button>
            </form>
          </Card>
          <Card title="Wunschzettel bearbeiten">
            <details>
              <summary className={`${linkCls} cursor-pointer`}>Einstellungen öffnen</summary>
              <form action={updateWishlistAction} className="mt-2">
                <Hidden listId={list.id} />
                <ListFields profiles={profiles} birthdays={birthdays} l={list} lockOwner={list.iAmWisher} />
                <button className={buttonCls}>Änderungen speichern</button>
              </form>
              <form action={deleteWishlistAction} className="mt-2">
                <Hidden listId={list.id} />
                <button className={ghostButtonCls}>Wunschzettel löschen</button>
              </form>
            </details>
          </Card>
        </>
      ) : null}
    </div>
  );
}
