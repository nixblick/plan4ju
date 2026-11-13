import Link from "next/link";
import { errorMessages, one } from "@/lib/messages";
import { resetPasswordAction } from "../actions";
import { buttonCls, Card, Field, inputCls, Notice } from "../ui";

export default async function Zuruecksetzen({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const token = one(sp.token);
  const fehler = one(sp.fehler);
  return (
    <div className="mx-auto max-w-md">
      <Card title="Neues Kennwort setzen">
        {fehler ? <Notice kind="error">{errorMessages[fehler] ?? "Das hat nicht geklappt."}</Notice> : null}
        {token ? (
          <form action={resetPasswordAction}>
            <input type="hidden" name="token" value={token} />
            <Field label="Neues Kennwort (mindestens 10 Zeichen)">
              <input className={inputCls} type="password" name="newPassword" autoComplete="new-password" minLength={10} maxLength={128} required />
            </Field>
            <button className={`${buttonCls} w-full`}>Speichern</button>
          </form>
        ) : (
          <p>
            Der Link ist ungültig oder abgelaufen.{" "}
            <Link href="/passwort-vergessen" className="text-terracotta underline">
              Neuen Link anfordern
            </Link>
          </p>
        )}
      </Card>
    </div>
  );
}
