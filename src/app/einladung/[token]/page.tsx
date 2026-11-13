import Link from "next/link";
import { errorMessages, one, roleLabels } from "@/lib/messages";
import { lookupInvitation } from "@/server/services/invitations";
import { getSessionUser } from "@/server/session";
import { acceptAction, registerAction } from "../../actions";
import { buttonCls, Card, Field, inputCls, Notice } from "../../ui";

export default async function Einladung({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await params;
  const fehler = one((await searchParams).fehler);
  const info = await lookupInvitation(token);
  if (info.status !== "valid") {
    return (
      <div className="mx-auto max-w-md">
        <Card title="Einladung">
          <p>{errorMessages.einladung}</p>
          <p className="mt-3 text-sm text-stone-600">Bitte lass dir bei Bedarf eine neue Einladung schicken.</p>
        </Card>
      </div>
    );
  }
  const user = await getSessionUser();
  const here = `/einladung/${encodeURIComponent(token)}`;
  return (
    <div className="mx-auto max-w-md">
      <Card title={`Einladung zu „${info.familyName}“`}>
        {fehler ? <Notice kind="error">{errorMessages[fehler] ?? "Das hat nicht geklappt."}</Notice> : null}
        <p className="mb-4 text-sm text-stone-600">
          Eingeladen als {roleLabels[info.role!]} mit der Adresse {info.email}.
        </p>
        {user ? (
          user.email.toLowerCase() === info.email ? (
            <form action={acceptAction}>
              <input type="hidden" name="token" value={token} />
              <button className={`${buttonCls} w-full`}>Familie beitreten</button>
            </form>
          ) : (
            <Notice kind="error">
              Du bist als {user.email} angemeldet, die Einladung gilt für {info.email}. Bitte melde dich ab und öffne den Link erneut.
            </Notice>
          )
        ) : info.accountExists ? (
          <p>
            Zu dieser Adresse gibt es schon einen Zugang.{" "}
            <Link href={`/anmelden?weiter=${encodeURIComponent(here)}`} className="text-terracotta underline">
              Jetzt anmelden und beitreten
            </Link>
          </p>
        ) : (
          <form action={registerAction}>
            <input type="hidden" name="token" value={token} />
            <Field label="Dein Name">
              <input className={inputCls} name="name" autoComplete="name" maxLength={100} required />
            </Field>
            <Field label="Kennwort (mindestens 10 Zeichen)">
              <input className={inputCls} type="password" name="password" autoComplete="new-password" minLength={10} maxLength={128} required />
            </Field>
            <button className={`${buttonCls} w-full`}>Zugang anlegen und beitreten</button>
          </form>
        )}
      </Card>
    </div>
  );
}
