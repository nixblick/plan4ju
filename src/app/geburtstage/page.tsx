import { errorMessages, okMessages, one } from "@/lib/messages";
import { daysBetween, nextBirthday, todayIn } from "@/lib/week";
import { listBirthdays } from "@/server/services/birthdays";
import { requireFamily } from "@/server/session";
import { createBirthdayAction, deleteBirthdayAction, updateBirthdayAction } from "../planung-actions";
import { buttonCls, Card, Field, ghostButtonCls, inputCls, Notice } from "../ui";
import { getDashboard } from "@/server/services/dashboard";
import { wishlistsByBirthday } from "@/server/services/wishes";
import { activeModules } from "@/server/active-modules";
import Link from "next/link";
import { FesteTabs } from "./tabs";

export const dynamic = "force-dynamic";

const MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

function BirthdayFields({ b }: { b?: { name: string; day: number; month: number; birthYear: number | null; note: string | null } }) {
  return (
    <>
      <Field label="Name">
        <input className={inputCls} name="name" maxLength={100} defaultValue={b?.name} required />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Tag">
          <input className={inputCls} type="number" name="day" min={1} max={31} defaultValue={b?.day} required />
        </Field>
        <Field label="Monat">
          <select className={inputCls} name="month" defaultValue={b?.month ?? ""} required>
            <option value="" disabled>Bitte wählen</option>
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>{m}</option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Geburtsjahr (optional)">
        <input className={inputCls} type="number" name="birthYear" min={1900} max={2100} defaultValue={b?.birthYear ?? ""} />
      </Field>
      <Field label="Notiz (optional)">
        <input className={inputCls} name="note" maxLength={500} defaultValue={b?.note ?? ""} />
      </Field>
    </>
  );
}

export default async function Geburtstage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { user, familyId } = await requireFamily();
  const sp = await searchParams;
  const fehler = one(sp.fehler);
  const ok = one(sp.ok);
  const modules = await activeModules();
  const [dash, list, wishlists] = await Promise.all([
    getDashboard(user.id, familyId),
    listBirthdays(user.id, familyId),
    modules.wishes ? wishlistsByBirthday(user.id, familyId) : Promise.resolve(new Map<string, never[]>()),
  ]);
  const today = todayIn(dash.timezone);
  const rows = list
    .map((b) => {
      const date = nextBirthday(b.month, b.day, today);
      return { b, date, inDays: daysBetween(today, date) };
    })
    .sort((a, c) => a.inDays - c.inDays || a.b.name.localeCompare(c.b.name, "de"));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Geburtstage</h1>
      <FesteTabs active="geburtstage" />
      {fehler ? <Notice kind="error">{errorMessages[fehler] ?? "Das hat nicht geklappt."}</Notice> : null}
      {ok ? <Notice kind="ok">{okMessages[ok] ?? "Gespeichert."}</Notice> : null}

      <Card title="Neuer Geburtstag">
        <form action={createBirthdayAction}>
          <BirthdayFields />
          <button className={buttonCls}>Geburtstag speichern</button>
        </form>
      </Card>

      <Card title="Nächste Geburtstage">
        {rows.length === 0 ? (
          <p className="text-stone-600">Noch keine Geburtstage eingetragen.</p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {rows.map(({ b, inDays, date }) => (
              <li key={b.id} className="py-3" data-testid="birthday-row">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="min-w-0 break-words font-medium">{b.name}</span>
                  <span className="text-sm text-stone-600">
                    {b.day}. {MONTHS[b.month - 1]}
                    {b.birthYear ? ` · wird ${Number(date.slice(0, 4)) - b.birthYear}` : ""} ·{" "}
                    {inDays === 0 ? "heute" : inDays === 1 ? "morgen" : `in ${inDays} Tagen`}
                  </span>
                </div>
                {b.note ? <p className="text-sm text-stone-600">{b.note}</p> : null}
                {(wishlists.get(b.id) ?? []).map((w) => (
                  <Link key={w.id} href={`/wuensche/${w.id}`} className="mr-3 inline-flex min-h-11 items-center text-sm text-terracotta-dark underline">
                    Wunschzettel: {w.title}
                  </Link>
                ))}
                <details className="mt-2">
                  <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm text-terracotta-dark underline">Bearbeiten</summary>
                  <form action={updateBirthdayAction} className="mt-2">
                    <input type="hidden" name="birthdayId" value={b.id} />
                    <BirthdayFields b={b} />
                    <button className={buttonCls}>Änderungen speichern</button>
                  </form>
                  <form action={deleteBirthdayAction} className="mt-2">
                    <input type="hidden" name="birthdayId" value={b.id} />
                    <button className={ghostButtonCls}>Löschen</button>
                  </form>
                </details>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
