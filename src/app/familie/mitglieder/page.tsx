import { errorMessages, okMessages, one, roleLabels } from "@/lib/messages";
import { atLeast, canManage } from "@/server/permissions";
import { listInvitations } from "@/server/services/invitations";
import { listMembers, listProfiles } from "@/server/services/members";
import { requireFamily } from "@/server/session";
import { addChildAction, deleteChildAction, inviteAction, removeMemberAction, revokeAction, roleAction } from "../../actions";
import { buttonCls, Card, ghostButtonCls, inputCls, Notice } from "../../ui";

export default async function Mitglieder({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { user, familyId, role } = await requireFamily();
  const sp = await searchParams;
  const fehler = one(sp.fehler);
  const ok = one(sp.ok);
  const isAdmin = atLeast(role, "ADMIN");
  const [members, profiles, invitations] = await Promise.all([
    listMembers(user.id, familyId),
    listProfiles(user.id, familyId),
    isAdmin ? listInvitations(user.id, familyId) : Promise.resolve([]),
  ]);
  const children = profiles.filter((p) => p.isChild && !p.userId);
  const date = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" });

  return (
    <div className="space-y-6">
      {fehler ? <Notice kind="error">{errorMessages[fehler] ?? "Das hat nicht geklappt."}</Notice> : null}
      {ok ? <Notice kind="ok">{okMessages[ok] ?? "Gespeichert."}</Notice> : null}

      <Card title="Mitglieder">
        <ul className="divide-y divide-stone-100">
          {members.map((m) => (
            <li key={m.userId} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <span>
                <strong>{m.name}</strong>
                {m.isSelf ? <span className="ml-1 text-sm text-stone-500">(du)</span> : null}
                {m.email ? <span className="block text-sm text-stone-600">{m.email}</span> : null}
              </span>
              <span className="flex items-center gap-2">
                {role === "OWNER" ? (
                  <form action={roleAction} className="flex items-center gap-2">
                    <input type="hidden" name="userId" value={m.userId} />
                    <select name="role" defaultValue={m.role} className={inputCls + " !w-auto"} aria-label={`Rolle von ${m.name}`}>
                      <option value="OWNER">{roleLabels.OWNER}</option>
                      <option value="ADMIN">{roleLabels.ADMIN}</option>
                      <option value="MEMBER">{roleLabels.MEMBER}</option>
                    </select>
                    <button className={ghostButtonCls}>Ändern</button>
                  </form>
                ) : (
                  <span className="text-sm text-stone-600">{roleLabels[m.role]}</span>
                )}
                {!m.isSelf && canManage(role, m.role) ? (
                  <form action={removeMemberAction}>
                    <input type="hidden" name="userId" value={m.userId} />
                    <button className={ghostButtonCls}>Entfernen</button>
                  </form>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Kinderprofile (ohne Anmeldung)">
        {children.length === 0 ? <p className="text-sm text-stone-600">Noch keine Kinderprofile.</p> : null}
        <ul className="divide-y divide-stone-100">
          {children.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 py-3">
              <span>{c.displayName}</span>
              {isAdmin ? (
                <form action={deleteChildAction}>
                  <input type="hidden" name="profileId" value={c.id} />
                  <button className={ghostButtonCls}>Löschen</button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
        {isAdmin ? (
          <form action={addChildAction} className="mt-4 flex gap-2">
            <input className={inputCls} name="displayName" placeholder="Name des Kindes" maxLength={60} required aria-label="Name des Kindes" />
            <button className={buttonCls}>Anlegen</button>
          </form>
        ) : null}
      </Card>

      {isAdmin ? (
        <Card title="Einladungen">
          <form action={inviteAction} className="mb-4 flex flex-col gap-2 sm:flex-row">
            <input className={inputCls} type="email" name="email" placeholder="E-Mail-Adresse" required aria-label="E-Mail-Adresse" />
            <select name="role" className={inputCls + " sm:!w-auto"} aria-label="Rolle">
              <option value="MEMBER">{roleLabels.MEMBER}</option>
              {role === "OWNER" ? <option value="ADMIN">{roleLabels.ADMIN}</option> : null}
            </select>
            <button className={buttonCls}>Einladen</button>
          </form>
          {invitations.length === 0 ? <p className="text-sm text-stone-600">Keine offenen Einladungen.</p> : null}
          <ul className="divide-y divide-stone-100">
            {invitations.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <span>
                  {i.email} <span className="text-sm text-stone-600">({roleLabels[i.role]})</span>
                  <span className="block text-sm text-stone-600">
                    {i.expired ? "abgelaufen am " : "gültig bis "}
                    {date.format(i.expiresAt)}
                  </span>
                </span>
                <form action={revokeAction}>
                  <input type="hidden" name="id" value={i.id} />
                  <button className={ghostButtonCls}>Widerrufen</button>
                </form>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
