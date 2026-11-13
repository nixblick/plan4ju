import Link from "next/link";
import { errorMessages, one } from "@/lib/messages";
import { templateByKey } from "@/lib/routine-templates";
import { getDashboard } from "@/server/services/dashboard";
import { requireFamily } from "@/server/session";
import { createRoutineAction } from "../../planung-actions";
import { buttonCls, Card, Notice } from "../../ui";
import { RoutineFields } from "../form";

export const dynamic = "force-dynamic";

export default async function NeueRoutine({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { user, familyId } = await requireFamily();
  const sp = await searchParams;
  const fehler = one(sp.fehler);
  const dash = await getDashboard(user.id, familyId);
  const t = templateByKey(one(sp.vorlage));
  return (
    <div className="space-y-6">
      <p>
        <Link href="/routinen" className="inline-flex min-h-11 items-center text-sm underline">← Zurück zu den Routinen</Link>
      </p>
      <h1 className="text-2xl font-bold">{t ? `Neue Routine: ${t.title}` : "Neue Routine"}</h1>
      {fehler ? <Notice kind="error">{errorMessages[fehler] ?? "Das hat nicht geklappt."}</Notice> : null}
      <Card>
        <form action={createRoutineAction}>
          <RoutineFields
            profiles={dash.profiles}
            v={{
              title: t?.title ?? "",
              description: t?.description || null,
              freq: t?.freq ?? "DAILY",
              interval: 1,
              weekdays: t?.weekdays ?? [],
              monthDay: null,
              startDate: dash.today,
              endDate: null,
              timeOfDay: t?.timeOfDay ?? null,
              assignMode: "FIXED",
              assigneeIds: [],
            }}
          />
          <button className={buttonCls}>Routine anlegen</button>
        </form>
      </Card>
    </div>
  );
}
