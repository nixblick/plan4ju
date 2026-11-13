import { errorMessages, okMessages, one } from "@/lib/messages";
import { MIN_PASSWORD_LENGTH } from "@/server/auth";
import { requireUser } from "@/server/session";
import { changePasswordAction, signOutEverywhereAction } from "../konto-actions";
import { buttonCls, Card, Field, ghostButtonCls, inputCls, Notice } from "../ui";

export const dynamic = "force-dynamic";

export default async function Konto({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const fehler = one(sp.fehler);
  const ok = one(sp.ok);
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
    </div>
  );
}
