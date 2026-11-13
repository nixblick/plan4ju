import Link from "next/link";
import { redirect } from "next/navigation";
import { errorMessages, one } from "@/lib/messages";
import { safeNext } from "@/lib/safe-next";
import { getSessionUser } from "@/server/session";
import { loginAction } from "../actions";
import { buttonCls, Card, Field, inputCls, Notice } from "../ui";

export default async function Anmelden({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const next = safeNext(one(sp.weiter));
  if (await getSessionUser()) redirect(next ?? "/familie-waehlen");
  const fehler = one(sp.fehler);
  return (
    <div className="mx-auto max-w-md">
      <Card title="Anmelden">
        {fehler ? <Notice kind="error">{errorMessages[fehler] ?? "Anmeldung fehlgeschlagen."}</Notice> : null}
        {one(sp.zurueckgesetzt) ? <Notice kind="ok">Dein Zugang wurde erneuert. Du kannst dich jetzt anmelden.</Notice> : null}
        {one(sp.ok) === "ueberall-abgemeldet" ? <Notice kind="ok">Du bist auf allen Geräten abgemeldet.</Notice> : null}
        <form action={loginAction}>
          {next ? <input type="hidden" name="weiter" value={next} /> : null}
          <Field label="E-Mail-Adresse">
            <input className={inputCls} type="email" name="email" autoComplete="email" required />
          </Field>
          <Field label="Kennwort">
            <input className={inputCls} type="password" name="password" autoComplete="current-password" required />
          </Field>
          <button className={`${buttonCls} w-full`}>Anmelden</button>
        </form>
        <p className="mt-4 text-sm">
          <Link href="/passwort-vergessen" className="text-terracotta underline">
            Kennwort vergessen?
          </Link>
        </p>
        <p className="mt-2 text-sm text-stone-600">Plan4JU ist nur mit Einladung nutzbar.</p>
      </Card>
    </div>
  );
}
