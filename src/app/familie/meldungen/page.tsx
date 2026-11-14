import { notFound } from "next/navigation";
import { listUndeliveredFeedback } from "@/server/services/feedback";
import { requireFamily } from "@/server/session";
import { Card } from "../../ui";
import { FamilieTabs } from "../tabs";

export const dynamic = "force-dynamic";

const KIND: Record<string, string> = { BUG: "Fehler", IDEA: "Idee", OTHER: "Sonstiges" };
const fmt = (d: Date) => d.toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });

/** Owners only: feedback of the own family whose mail has not been delivered (yet). */
export default async function Meldungen() {
  const { user, familyId, role } = await requireFamily();
  if (role !== "OWNER") notFound();
  const rows = await listUndeliveredFeedback(user.id, familyId);
  return (
    <div className="space-y-6">
      <FamilieTabs active="module" />
      <h1 className="text-2xl font-bold">Meldungen, die nicht zugestellt wurden</h1>
      <p className="text-sm text-stone-600">
        Rückmeldungen werden gespeichert und per Mail weitergegeben. Klappt der Versand nicht, versucht Plan4JU es bis zu fünfmal
        mit wachsendem Abstand. Danach gilt die Meldung als fehlgeschlagen.
      </p>
      <Card title="Offen">
        {rows.length === 0 ? (
          <p className="text-sm text-stone-600">Alle Meldungen sind zugestellt.</p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {rows.map((r) => (
              <li key={r.id} className="py-3" data-testid="meldung-row">
                <span className="block break-words">
                  <strong>{KIND[r.kind] ?? r.kind}</strong> vom {fmt(r.createdAt)}: {r.message.length > 120 ? `${r.message.slice(0, 120)} …` : r.message}
                </span>
                <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs ${r.mailFailedAt ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-900"}`}>
                  {r.mailFailedAt
                    ? `fehlgeschlagen nach ${r.mailAttempts} Versuchen`
                    : r.mailNextAt
                      ? `${r.mailAttempts} von 5 Versuchen, nächster ab ${fmt(r.mailNextAt)}`
                      : "noch nicht versucht"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
