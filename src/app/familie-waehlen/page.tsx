import { errorMessages, okMessages, one, roleLabels } from "@/lib/messages";
import { listFamiliesForUser } from "@/server/services/families";
import { requireUser } from "@/server/session";
import { chooseFamilyAction } from "../actions";
import { Card, ghostButtonCls, Notice } from "../ui";

export default async function FamilieWaehlen({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const families = await listFamiliesForUser(user.id);
  const sp = await searchParams;
  const fehler = one(sp.fehler);
  const ok = one(sp.ok);
  return (
    <div className="mx-auto max-w-md">
      <Card title="Familie wählen">
        {fehler ? <Notice kind="error">{errorMessages[fehler] ?? "Das hat nicht geklappt."}</Notice> : null}
        {ok && okMessages[ok] ? <Notice kind="ok">{okMessages[ok]}</Notice> : null}
        {families.length === 0 ? (
          <p>Du gehörst noch zu keiner Familie. Bitte nutze den Einladungslink, den du per E-Mail bekommen hast.</p>
        ) : (
          <ul className="space-y-3">
            {families.map((m) => (
              <li key={m.family.id}>
                <form action={chooseFamilyAction} className="flex items-center justify-between gap-3">
                  <input type="hidden" name="familyId" value={m.family.id} />
                  <span>
                    <strong>{m.family.name}</strong>
                    <span className="ml-2 text-sm text-stone-600">{roleLabels[m.role]}</span>
                  </span>
                  <button className={ghostButtonCls}>Öffnen</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
