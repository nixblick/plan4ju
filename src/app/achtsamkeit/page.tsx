import Link from "next/link";
import {
  average, RATINGS, ratingLabel, TOPIC_LABELS, TOPICS, VISIBILITY_LABELS, NOTE_MAX, type Topic,
} from "@/lib/achtsamkeit";
import { errorMessages, okMessages, one } from "@/lib/messages";
import { addDays, weekOf } from "@/lib/week";
import {
  familyToday, listEntries, listViewerCandidates, listVisibleProfiles, listWritableProfiles, type EntryView,
} from "@/server/services/mindfulness";
import { requireFamily } from "@/server/session";
import { deleteEntryAction, saveEntryAction } from "../achtsamkeit-actions";
import { FamilieTabs } from "../familie/tabs";
import { buttonCls, Card, ghostButtonCls, inputCls, Notice } from "../ui";

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const dayFmt = new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "numeric", month: "numeric", timeZone: "UTC" });
const monthFmt = new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric", timeZone: "UTC" });
const d = (iso: string) => new Date(`${iso}T00:00:00Z`);

function monthRange(iso: string): { from: string; to: string } {
  const from = `${iso.slice(0, 7)}-01`;
  const next = d(from);
  next.setUTCMonth(next.getUTCMonth() + 1);
  return { from, to: addDays(next.toISOString().slice(0, 10), -1) };
}

export default async function Achtsamkeit({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { user, familyId } = await requireFamily();
  const sp = await searchParams;
  const fehler = one(sp.fehler);
  const ok = one(sp.ok);
  const today = await familyToday(user.id, familyId);
  const anchor = ISO.test(one(sp.datum) ?? "") ? one(sp.datum)! : today;
  const view = one(sp.ansicht) === "monat" ? "monat" : "woche";
  const topicParam = one(sp.thema);
  const topic = (TOPICS as readonly string[]).includes(topicParam ?? "") ? (topicParam as Topic) : null;

  const [writable, visible, viewers] = await Promise.all([
    listWritableProfiles(user.id, familyId),
    listVisibleProfiles(user.id, familyId),
    listViewerCandidates(user.id, familyId),
  ]);
  const people = [...writable.map((p) => ({ id: p.id, name: p.displayName })), ...visible]
    .filter((p, i, all) => all.findIndex((x) => x.id === p.id) === i);
  const own = writable.find((p) => p.userId === user.id) ?? writable[0];
  const personParam = one(sp.person);
  const person = people.find((p) => p.id === personParam) ?? people.find((p) => p.id === own?.id) ?? people[0];

  const week = weekOf(anchor);
  const range = view === "monat" ? monthRange(anchor) : { from: week[0]!, to: week[6]! };
  const entries: EntryView[] = person ? await listEntries(user.id, familyId, { ...range, profileId: person.id }) : [];
  const shown = topic ? entries.filter((e) => e.topic === topic) : entries;

  const link = (p: Record<string, string | null | undefined>) => {
    const q = new URLSearchParams();
    const all = { person: person?.id, ansicht: view, datum: anchor, thema: topic, ...p };
    for (const [k, v] of Object.entries(all)) if (v) q.set(k, v);
    return `/achtsamkeit?${q}`;
  };
  const step = view === "monat" ? (n: number) => { const x = d(range.from); x.setUTCMonth(x.getUTCMonth() + n); return x.toISOString().slice(0, 10); } : (n: number) => addDays(anchor, 7 * n);

  return (
    // data-feedback-ignore: the feedback screenshot leaves this area out, so no rating or note ends up in a mail.
    <div className="space-y-6" data-feedback-ignore="true">
      <FamilieTabs active="achtsamkeit" />
      <div>
        <h1 className="text-2xl font-bold">Achtsamkeit</h1>
        <p className="text-sm text-stone-600">
          Wie geht es dir? Eine Bewertung je Thema und Tag, nur für dich, für ausgewählte Personen oder die Familie. Keine Diagnose, keine automatische Auswertung.
        </p>
      </div>
      {fehler ? <Notice kind="error">{errorMessages[fehler] ?? "Das hat nicht geklappt."}</Notice> : null}
      {ok ? <Notice kind="ok">{okMessages[ok] ?? "Gespeichert."}</Notice> : null}

      {writable.length > 0 ? (
        <Card title="Neue Bewertung">
          <form action={saveEntryAction} aria-label="Bewertung erfassen" className="space-y-4">
            {person ? <input type="hidden" name="person" value={person.id} /> : null}
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="block">
                <span className="mb-1 block text-sm font-medium">Für</span>
                <select name="profileId" defaultValue={person && writable.some((w) => w.id === person.id) ? person.id : own?.id} className={inputCls}>
                  {writable.map((p) => <option key={p.id} value={p.id}>{p.userId === user.id ? `${p.displayName} (du)` : p.displayName}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium">Thema</span>
                <select name="topic" defaultValue={topic ?? "MOOD"} className={inputCls}>
                  {TOPICS.map((t) => <option key={t} value={t}>{TOPIC_LABELS[t]}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium">Datum</span>
                <input type="date" name="date" defaultValue={today} max={today} required className={inputCls} />
              </label>
            </div>
            <fieldset>
              <legend className="mb-1 text-sm font-medium">Bewertung</legend>
              <div className="grid grid-cols-5 gap-1">
                {[1, 2, 3, 4, 5].map((r) => (
                  <label key={r} className="flex min-h-14 cursor-pointer flex-col items-center justify-center rounded-xl border border-stone-300 bg-white text-xs has-[:checked]:border-terracotta has-[:checked]:bg-orange-50 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-terracotta/50">
                    <input type="radio" name="rating" value={r} required className="sr-only" aria-label={ratingLabel(r)} />
                    <span className="text-2xl" aria-hidden="true">{RATINGS[r]!.emoji}</span>
                    <span aria-hidden="true">{r}</span>
                  </label>
                ))}
              </div>
              <p className="mt-1 text-xs text-stone-500">1 = schlecht, 5 = super</p>
            </fieldset>
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Notiz (optional)</span>
              <textarea name="note" maxLength={NOTE_MAX} rows={2} className={inputCls} />
            </label>
            <fieldset>
              <legend className="mb-1 text-sm font-medium">Wer darf das sehen?</legend>
              <div className="space-y-1">
                {(["PRIVATE", "SELECTED", "FAMILY"] as const).map((v) => (
                  <label key={v} className="flex min-h-11 items-center gap-2">
                    <input type="radio" name="visibility" value={v} defaultChecked={v === "PRIVATE"} />
                    <span>{VISIBILITY_LABELS[v]}{v === "FAMILY" ? " (nicht bei Gesundheit)" : ""}</span>
                  </label>
                ))}
              </div>
              {viewers.length > 0 ? (
                <div className="mt-2 rounded-xl bg-stone-50 p-3">
                  <p className="mb-1 text-sm text-stone-600">Ausgewählte Personen:</p>
                  {viewers.map((v) => (
                    <label key={v.userId} className="flex min-h-11 items-center gap-2">
                      <input type="checkbox" name="viewer" value={v.userId} />
                      <span>{v.name}</span>
                    </label>
                  ))}
                </div>
              ) : null}
              <p className="mt-1 text-xs text-stone-500">
                Voreinstellung ist „Nur ich“. Gesundheit kann höchstens mit ausgewählten Personen geteilt werden. Auch Eltern und Admins sehen nur, was für sie freigegeben ist.
              </p>
            </fieldset>
            <button className={buttonCls}>Speichern</button>
          </form>
        </Card>
      ) : null}

      {person ? (
        <>
          <form method="get" className="flex flex-wrap items-end gap-2">
            <label className="block min-w-0 flex-1">
              <span className="mb-1 block text-sm font-medium">Person</span>
              <select name="person" defaultValue={person.id} className={inputCls}>
                {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
            <label className="block min-w-0 flex-1">
              <span className="mb-1 block text-sm font-medium">Thema filtern</span>
              <select name="thema" defaultValue={topic ?? ""} className={inputCls}>
                <option value="">Alle Themen</option>
                {TOPICS.map((t) => <option key={t} value={t}>{TOPIC_LABELS[t]}</option>)}
              </select>
            </label>
            <input type="hidden" name="ansicht" value={view} />
            <input type="hidden" name="datum" value={anchor} />
            <button className={ghostButtonCls}>Anzeigen</button>
          </form>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-1 rounded-xl bg-stone-100 p-1 text-sm">
              <Link href={link({ ansicht: "woche" })} aria-current={view === "woche" ? "page" : undefined} className={`flex min-h-11 items-center rounded-lg px-3 font-medium ${view === "woche" ? "bg-white text-terracotta-dark shadow-sm" : "text-stone-700"}`}>Woche</Link>
              <Link href={link({ ansicht: "monat" })} aria-current={view === "monat" ? "page" : undefined} className={`flex min-h-11 items-center rounded-lg px-3 font-medium ${view === "monat" ? "bg-white text-terracotta-dark shadow-sm" : "text-stone-700"}`}>Monat</Link>
            </div>
            <div className="flex items-center gap-1 text-sm">
              <Link href={link({ datum: step(-1) })} className={ghostButtonCls} aria-label="Zurück">‹</Link>
              <span className="px-1 font-medium">
                {view === "monat" ? monthFmt.format(d(range.from)) : `${dayFmt.format(d(range.from))} – ${dayFmt.format(d(range.to))}`}
              </span>
              <Link href={link({ datum: step(1) })} className={ghostButtonCls} aria-label="Weiter">›</Link>
            </div>
          </div>

          {view === "woche" ? (
            <Card title={`Woche von ${person.name}`}>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[20rem] text-center text-sm">
                  <thead>
                    <tr>
                      <th className="py-1 text-left font-medium">Thema</th>
                      {week.map((day) => <th key={day} className="px-0.5 py-1 font-medium">{dayFmt.format(d(day)).split(",")[0]}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {TOPICS.filter((t) => !topic || t === topic).map((t) => (
                      <tr key={t} className="border-t border-stone-100">
                        <th className="py-1 text-left font-normal">{TOPIC_LABELS[t]}</th>
                        {week.map((day) => {
                          const es = entries.filter((e) => e.topic === t && e.date === day);
                          return (
                            <td key={day} className="px-0.5 py-1">
                              {es.map((e) => <span key={e.id} title={ratingLabel(e.rating)} aria-label={ratingLabel(e.rating)}>{RATINGS[e.rating]!.emoji}</span>)}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ) : (
            <Card title={`Monat von ${person.name}`}>
              <ul className="divide-y divide-stone-100">
                {TOPICS.filter((t) => !topic || t === topic).map((t) => {
                  const rs = entries.filter((e) => e.topic === t).map((e) => e.rating);
                  const avg = average(rs);
                  return (
                    <li key={t} className="flex items-center justify-between gap-3 py-2">
                      <span>{TOPIC_LABELS[t]}</span>
                      <span className="text-sm text-stone-700">
                        {avg == null ? "–" : `${RATINGS[Math.round(avg)]!.emoji} Ø ${avg.toLocaleString("de-DE")} (${rs.length} ${rs.length === 1 ? "Bewertung" : "Bewertungen"})`}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}

          <Card title="Verlauf">
            {shown.length === 0 ? (
              <p className="text-sm text-stone-600">In diesem Zeitraum gibt es keine Einträge.</p>
            ) : (
              <ul className="divide-y divide-stone-100">
                {shown.map((e) => (
                  <li key={e.id} className="py-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium">
                          <span aria-hidden="true">{RATINGS[e.rating]!.emoji} </span>
                          {TOPIC_LABELS[e.topic]}: {e.rating} von 5 ({RATINGS[e.rating]!.word})
                        </p>
                        <p className="text-sm text-stone-600">
                          {dayFmt.format(d(e.date))}
                          {e.mine ? ` · von dir · ${VISIBILITY_LABELS[e.visibility]}${e.viewers.length ? `: ${e.viewers.map((v) => v.name).join(", ")}` : ""}` : ""}
                        </p>
                        {e.note ? <p className="mt-1 whitespace-pre-line break-words text-sm">{e.note}</p> : null}
                      </div>
                      {e.mine ? (
                        <details className="text-sm">
                          <summary className="flex min-h-11 cursor-pointer items-center text-terracotta-dark underline">Löschen …</summary>
                          <form action={deleteEntryAction} className="mt-1">
                            <input type="hidden" name="entryId" value={e.id} />
                            <input type="hidden" name="person" value={person.id} />
                            <button className={ghostButtonCls} aria-label={`Eintrag ${TOPIC_LABELS[e.topic]} vom ${dayFmt.format(d(e.date))} endgültig löschen`}>Endgültig löschen</button>
                          </form>
                        </details>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      ) : null}
    </div>
  );
}

export const dynamic = "force-dynamic";
