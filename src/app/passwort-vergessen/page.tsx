import Link from "next/link";
import { errorMessages, one } from "@/lib/messages";
import { requestResetAction } from "../actions";
import { buttonCls, Card, Field, inputCls, Notice } from "../ui";

export default async function Vergessen({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const fehler = one(sp.fehler);
  return (
    <div className="mx-auto max-w-md">
      <Card title="Kennwort vergessen">
        {fehler ? <Notice kind="error">{errorMessages[fehler] ?? "Das hat nicht geklappt."}</Notice> : null}
        {one(sp.gesendet) ? (
          <Notice kind="ok">Wenn es zu dieser Adresse einen Zugang gibt, ist eine E-Mail mit einem Link unterwegs.</Notice>
        ) : null}
        <form action={requestResetAction}>
          <Field label="E-Mail-Adresse">
            <input className={inputCls} type="email" name="email" autoComplete="email" required />
          </Field>
          <button className={`${buttonCls} w-full`}>Link anfordern</button>
        </form>
        <p className="mt-4 text-sm">
          <Link href="/anmelden" className="text-terracotta underline">
            Zurück zur Anmeldung
          </Link>
        </p>
      </Card>
    </div>
  );
}
