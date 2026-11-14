import { errorMessages, okMessages, one } from "@/lib/messages";
import { MIN_PASSWORD_LENGTH } from "@/server/auth";
import { activeFamilyId, requireUser } from "@/server/session";
import { familiesBlockingAccountDelete } from "@/server/services/privacy";
import { withFamily } from "@/server/tenant";
import { changePasswordAction, deleteAccountAction, deleteFamilyAction, signOutEverywhereAction } from "../konto-actions";
import { buttonCls, Card, Field, ghostButtonCls, inputCls, Notice } from "../ui";

export const dynamic = "force-dynamic";

export default async function Konto({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const fehler = one(sp.fehler);
  const ok = one(sp.ok);
  const blocking = await familiesBlockingAccountDelete(user.id);
  const familyId = await activeFamilyId(user);
  const owned = familyId
    ? await withFamily(user.id, familyId, async ({ tx, role }) =>
        role === "OWNER" ? (await tx.family.findUniqueOrThrow({ where: { id: familyId }, select: { name: true } })).name : null,
      )
    : null;
  return (
    <div className="max-w-xl space-y-5">
      <h1 className="text-2xl font-bold">Konto</h1>
      <p className="break-words text-sm text-stone-600">Angemeldet als {user.name} ({user.email})</p>
      {fehler ? <Notice kind="error">{errorMessages[fehler] ?? "Das hat nicht geklappt."}</Notice> : null}
      {ok ? <Notice kind="ok">{okMessages[ok] ?? "Gespeichert."}</Notice> : null}
      <Card title="Kennwort ändern">
        <form action={changePasswordAction}>
          <Field label="Aktuelles Kennwort">
            <input name="current" type="password" autoComplete="current-password" required maxLength={128} className={inputCls} />
          </Field>
          <Field label={`Neues Kennwort (mindestens ${MIN_PASSWORD_LENGTH} Zeichen)`}>
            <input name="next" type="password" autoComplete="new-password" required minLength={MIN_PASSWORD_LENGTH} maxLength={128} className={inputCls} />
          </Field>
          <Field label="Neues Kennwort wiederholen">
            <input name="repeat" type="password" autoComplete="new-password" required minLength={MIN_PASSWORD_LENGTH} maxLength={128} className={inputCls} />
          </Field>
          <p className="mb-3 text-sm text-stone-600">Danach sind alle anderen Geräte abgemeldet; dieses bleibt angemeldet.</p>
          <button className={buttonCls}>Kennwort ändern</button>
        </form>
      </Card>
      <Card title="Überall abmelden">
        <p className="mb-3 text-sm text-stone-600">Beendet alle Sitzungen auf allen Geräten, auch diese. Hilfreich, wenn ein Gerät verloren ging.</p>
        <form action={signOutEverywhereAction}>
          <button className={ghostButtonCls}>Überall abmelden</button>
        </form>
      </Card>
      <Card title="Meine Daten herunterladen">
        <p className="mb-3 text-sm text-stone-600">
          Eine JSON-Datei mit deinem Konto, deinen Mitgliedschaften und allem, was du selbst eingetragen hast. Einträge anderer und
          Bildschirmfotos aus Feedbacks sind nicht enthalten.
        </p>
        <a href="/api/konto/export" download className={ghostButtonCls}>Daten herunterladen</a>
      </Card>
      {owned ? (
        <Card title="Familie löschen">
          <p className="mb-3 text-sm text-stone-600">
            Löscht „{owned}“ mit allen Aufgaben, Terminen, Rezepten, Listen und Profilen für alle Mitglieder. Das lässt sich nicht
            rückgängig machen.
          </p>
          <form action={deleteFamilyAction}>
            <Field label="Zur Bestätigung den Familiennamen eingeben">
              <input name="name" required maxLength={120} autoComplete="off" className={inputCls} />
            </Field>
            <button className={ghostButtonCls}>Familie endgültig löschen</button>
          </form>
        </Card>
      ) : null}
      <Card title="Konto löschen">
        {blocking.length > 0 ? (
          <div className="text-sm text-stone-600">
            <p className="mb-2">Du bist letzter Owner von:</p>
            <ul className="mb-2 list-disc pl-5">
              {blocking.map((b) => (
                <li key={b.familyId}>
                  <strong>{b.name}</strong>
                  {b.otherMembers > 0 ? " – mache unter Familie → Mitglieder jemanden zum Owner oder lösche die Familie." : " – lösche die Familie zuerst."}
                </li>
              ))}
            </ul>
            <p>Danach kannst du dein Konto hier löschen.</p>
          </div>
        ) : (
          <form action={deleteAccountAction}>
            <p className="mb-3 text-sm text-stone-600">
              Löscht dein Konto, deine Mitgliedschaften, deine Achtsamkeit, deine Feedbacks, Benachrichtigungen und Reservierungen.
              Was du für die Familie eingetragen hast (Aufgaben, Termine, Rezepte …), bleibt dort. Lade vorher deine Daten herunter, wenn du sie behalten willst.
            </p>
            <Field label="Kennwort zur Bestätigung">
              <input name="kennwort" type="password" autoComplete="current-password" required maxLength={128} className={inputCls} />
            </Field>
            <label className="mb-3 flex min-h-11 items-center gap-2 text-sm">
              <input type="checkbox" name="confirm" value="ja" required className="h-5 w-5" /> Ja, mein Konto endgültig löschen
            </label>
            <button className={ghostButtonCls}>Konto löschen</button>
          </form>
        )}
      </Card>
    </div>
  );
}
