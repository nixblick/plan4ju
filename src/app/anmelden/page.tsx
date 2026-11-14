import Link from "next/link";
import { redirect } from "next/navigation";
import { errorMessages, one } from "@/lib/messages";
import { safeNext } from "@/lib/safe-next";
import { getSessionUser } from "@/server/session";
import { loginAction } from "../actions";
import { buttonCls, Card, Field, inputCls, Notice } from "../ui";
import { Funktionen, Hero } from "../willkommen";

export default async function Anmelden({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const next = safeNext(one(sp.weiter));
  if (await getSessionUser()) redirect(next ?? "/familie-waehlen");
  const fehler = one(sp.fehler);
  return (
    <div className="flex flex-col gap-12 md:gap-16">
      <Hero>
        <div className="flex flex-wrap items-center gap-3">
          <a href="#anmelden" className={buttonCls}>Zur Anmeldung</a>
          <a href="#funktionen" className="inline-flex min-h-11 items-center px-2 font-medium underline">So funktioniert&apos;s</a>
        </div>
      </Hero>
      <div id="anmelden" className="mx-auto w-full max-w-md scroll-mt-6">
        <Card title="Anmelden">
          {fehler ? <Notice kind="error">{errorMessages[fehler] ?? "Anmeldung fehlgeschlagen."}</Notice> : null}
          {one(sp.zurueckgesetzt) ? <Notice kind="ok">Dein Zugang wurde erneuert. Du kannst dich jetzt anmelden.</Notice> : null}
          {one(sp.ok) === "ueberall-abgemeldet" ? <Notice kind="ok">Du bist auf allen Geräten abgemeldet.</Notice> : null}
          {one(sp.ok) === "konto-geloescht" ? <Notice kind="ok">Dein Konto und deine persönlichen Daten sind gelöscht.</Notice> : null}
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
      <Funktionen />
    </div>
  );
}
