import Link from "next/link";
import { errorMessages, one } from "@/lib/messages";
import { getDashboard } from "@/server/services/dashboard";
import { requireFamily } from "@/server/session";
import { createEventAction } from "../../../kalender-actions";
import { buttonCls, Card, Notice } from "../../../ui";
import { EventFields } from "../../form";

export const dynamic = "force-dynamic";

export default async function NeuerTermin({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { user, familyId } = await requireFamily();
  const sp = await searchParams;
  const dash = await getDashboard(user.id, familyId);
  const wanted = one(sp.datum);
  const date = wanted && /^\d{4}-\d{2}-\d{2}$/.test(wanted) ? wanted : dash.today;
  const fehler = one(sp.fehler);
  return (
    <div className="space-y-6">
      <p>
        <Link href="/kalender" className="inline-flex min-h-11 items-center text-sm underline">← Zurück zum Kalender</Link>
      </p>
      <h1 className="text-2xl font-bold">Neuer Termin</h1>
      {fehler ? <Notice kind="error">{errorMessages[fehler] ?? "Das hat nicht geklappt."}</Notice> : null}
      <Card>
        <form action={createEventAction}>
          <EventFields
            profiles={dash.profiles}
            v={{ title: "", description: null, location: null, allDay: false, startDate: date, startTime: "10:00", endDate: null, endTime: null, freq: null, interval: 1, weekdays: [], monthDay: null, repeatUntil: null, participantIds: [] }}
          />
          <button className={buttonCls}>Termin anlegen</button>
        </form>
      </Card>
    </div>
  );
}
