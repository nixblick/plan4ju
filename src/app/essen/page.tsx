import Link from "next/link";
import { errorMessages, okMessages, one } from "@/lib/messages";
import { addDays, parseIso, weekdayIndex } from "@/lib/week";
import type { DashProfile } from "@/server/services/dashboard";
import { getMealWeek, MEAL_LIMITS, type MealView } from "@/server/services/meals";
import { listProfiles } from "@/server/services/members";
import { listRecipes } from "@/server/services/recipes";
import { requireFamily } from "@/server/session";
import { addSlotAction, copyWeekAction, deleteMealAction, deleteSlotAction, moveSlotAction, renameSlotAction, saveMealAction } from "../essen-actions";
import { Dots, names } from "../people";
import { buttonCls, ghostButtonCls, inputCls, Notice } from "../ui";
import { EssenTabs } from "./tabs";
import { pageModule } from "@/server/active-modules";

export const dynamic = "force-dynamic";

const DAY_NAMES = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];
const dm = (iso: string) => `${parseIso(iso).d}.${parseIso(iso).m}.`;

function MealForm({ week, date, slotId, meal, slots, days, recipes, profiles }: {
  week: string; date: string; slotId: string; meal?: MealView;
  slots: { id: string; name: string }[]; days: string[];
  recipes: { id: string; title: string }[]; profiles: DashProfile[];
}) {
  const fid = `${date}-${slotId}`;
  return (
    <form action={saveMealAction} className="mt-2 space-y-3 rounded-xl bg-stone-50 p-3 text-sm">
      <input type="hidden" name="week" value={week} />
      {meal ? <input type="hidden" name="mealId" value={meal.id} /> : null}
      {meal ? (
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-1 block font-medium">Tag</span>
            <select name="date" defaultValue={date} className={inputCls}>
              {days.map((d, i) => <option key={d} value={d}>{DAY_NAMES[i]} {dm(d)}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block font-medium">Mahlzeit</span>
            <select name="slotId" defaultValue={slotId} className={inputCls}>
              {slots.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
        </div>
      ) : (
        <>
          <input type="hidden" name="date" value={date} />
          <input type="hidden" name="slotId" value={slotId} />
        </>
      )}
      <label className="block">
        <span className="mb-1 block font-medium">Rezept</span>
        <select name="recipeId" defaultValue={meal?.recipeId ?? ""} className={inputCls} id={`r-${fid}`}>
          <option value="">Kein Rezept (Freitext)</option>
          {recipes.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
        </select>
      </label>
      <label className="block">
        <span className="mb-1 block font-medium">oder Freitext</span>
        <input name="text" maxLength={MEAL_LIMITS.text} defaultValue={meal?.text ?? ""} placeholder="z. B. Reste, Pizza, bei Oma" className={inputCls} />
      </label>
      {profiles.length ? (
        <fieldset>
          <legend className="mb-1 font-medium">Wer kocht?</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {profiles.map((p) => (
              <label key={p.id} className="flex min-h-11 items-center gap-2">
                <input type="checkbox" name="cookIds" value={p.id} defaultChecked={meal?.cookIds.includes(p.id)} className="h-5 w-5" />
                <Dots profiles={profiles} ids={[p.id]} /> {p.name}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button className={buttonCls}>{meal ? "Speichern" : "Planen"}</button>
      </div>
    </form>
  );
}

export default async function Essen({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await pageModule("meals");
  const { user, familyId } = await requireFamily();
  const sp = await searchParams;
  const fehler = one(sp.fehler);
  const ok = one(sp.ok);
  const [w, rawProfiles, recipes] = await Promise.all([getMealWeek(user.id, familyId, one(sp.woche)), listProfiles(user.id, familyId), listRecipes(user.id, familyId)]);
  const profiles: DashProfile[] = rawProfiles.map((p, i) => ({ id: p.id, name: p.displayName, colorIndex: i, userId: p.userId }));
  const week = w.days[0]!;
  const prev = addDays(week, -7);
  const next = addDays(week, 7);

  return (
    <div className="space-y-6">
      <EssenTabs active="plan" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Essensplan</h1>
        <form action={copyWeekAction}>
          <input type="hidden" name="week" value={week} />
          <button className={ghostButtonCls} data-testid="copy-week">Woche in die nächste kopieren</button>
        </form>
      </div>
      {fehler ? <Notice kind="error">{errorMessages[fehler] ?? "Das hat nicht geklappt."}</Notice> : null}
      {ok ? <Notice kind="ok">{okMessages[ok] ?? "Gespeichert."}</Notice> : null}

      <nav className="flex items-center justify-between gap-2 text-sm" aria-label="Woche wählen">
        <Link href={`/essen?woche=${prev}`} className="inline-flex min-h-11 items-center underline">← Vorwoche</Link>
        <span className="font-medium">{dm(w.days[0]!)} – {dm(w.days[6]!)}</span>
        <Link href={`/essen?woche=${next}`} className="inline-flex min-h-11 items-center underline">Nächste →</Link>
      </nav>

      <ol className="grid gap-3 lg:grid-cols-2">
        {w.days.map((day) => (
          <li key={day} data-testid={day === w.today ? "meal-day-today" : "meal-day"} className={`rounded-2xl p-4 ring-1 ${day === w.today ? "bg-orange-50 ring-terracotta/50" : "bg-white ring-stone-200"}`}>
            <h2 className="mb-2 font-semibold">{DAY_NAMES[weekdayIndex(day)]} <span className="font-normal text-stone-600">{dm(day)}</span></h2>
            <ul className="space-y-2">
              {w.slots.map((s) => {
                const meal = w.meals.find((m) => m.date === day && m.slotId === s.id);
                return (
                  <li key={s.id} data-testid="meal-slot">
                    <details>
                      <summary className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
                        <span className="w-20 shrink-0 text-stone-600">{s.name}</span>
                        {meal ? (
                          <>
                            <span className="min-w-0 flex-1 break-words font-medium" data-testid="meal-title">{meal.recipeTitle ?? meal.text}</span>
                            <Dots profiles={profiles} ids={meal.cookIds} />
                            <span className="sr-only">Kocht: {meal.cookIds.length ? names(profiles, meal.cookIds) : "niemand eingeteilt"}</span>
                          </>
                        ) : (
                          <span className="flex-1 text-stone-500">+ planen</span>
                        )}
                      </summary>
                      {meal ? (
                        <p className="mt-1 text-xs text-stone-600">
                          Kocht: {meal.cookIds.length ? names(profiles, meal.cookIds) : "niemand eingeteilt"}
                          {meal.recipeId ? <> · <Link href={`/rezepte/${meal.recipeId}`} className="underline">Rezept öffnen</Link> · <Link href={`/einkauf/rezept/${meal.recipeId}`} className="underline">Zutaten einkaufen</Link></> : null}
                        </p>
                      ) : null}
                      <MealForm week={week} date={day} slotId={s.id} meal={meal} slots={w.slots} days={w.days} recipes={recipes} profiles={profiles} />
                      {meal ? (
                        <form action={deleteMealAction} className="mt-2">
                          <input type="hidden" name="week" value={week} />
                          <input type="hidden" name="mealId" value={meal.id} />
                          <button className="min-h-11 text-sm text-red-700 underline">Aus dem Plan nehmen</button>
                        </form>
                      ) : null}
                    </details>
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ol>

      <details className="rounded-2xl bg-white p-4 ring-1 ring-stone-200">
        <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium">Mahlzeiten des Tages einstellen</summary>
        <ul className="mt-2 space-y-2">
          {w.slots.map((s, i) => (
            <li key={s.id} className="flex flex-wrap items-center gap-2">
              <form action={renameSlotAction} className="flex min-w-0 flex-1 gap-2">
                <input type="hidden" name="week" value={week} />
                <input type="hidden" name="slotId" value={s.id} />
                <input name="name" defaultValue={s.name} maxLength={MEAL_LIMITS.slotName} aria-label={`Name der Mahlzeit ${i + 1}`} className={`${inputCls} min-w-0`} required />
                <button className={ghostButtonCls}>Umbenennen</button>
              </form>
              <form action={moveSlotAction}>
                <input type="hidden" name="week" value={week} />
                <input type="hidden" name="slotId" value={s.id} />
                <input type="hidden" name="dir" value="up" />
                <button className="h-11 w-11 rounded-xl border border-stone-300" aria-label={`${s.name} nach oben`} disabled={i === 0}>↑</button>
              </form>
              <form action={deleteSlotAction}>
                <input type="hidden" name="week" value={week} />
                <input type="hidden" name="slotId" value={s.id} />
                <button className="h-11 w-11 rounded-xl border border-stone-300 text-red-700" aria-label={`${s.name} entfernen`} disabled={w.slots.length <= 1}>×</button>
              </form>
            </li>
          ))}
        </ul>
        {w.slots.length < MEAL_LIMITS.slots ? (
          <form action={addSlotAction} className="mt-3 flex gap-2">
            <input type="hidden" name="week" value={week} />
            <input name="name" maxLength={MEAL_LIMITS.slotName} placeholder="z. B. Snack" aria-label="Neue Mahlzeit" className={`${inputCls} min-w-0`} required />
            <button className={ghostButtonCls}>Hinzufügen</button>
          </form>
        ) : null}
        <p className="mt-2 text-xs text-stone-600">Entfernen löscht auch die geplanten Einträge dieser Mahlzeit.</p>
      </details>
    </div>
  );
}
