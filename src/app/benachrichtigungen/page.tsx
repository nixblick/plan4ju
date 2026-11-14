import Link from "next/link";
import { errorMessages, okMessages, one } from "@/lib/messages";
import { requireFamily } from "@/server/session";
import { listNotifications, syncAndCount } from "@/server/services/notifications";
import { markAllReadAction, openNotificationAction } from "../benachrichtigung-actions";
import { ghostButtonCls, Notice } from "../ui";

export const dynamic = "force-dynamic";

const fmt = (d: Date) => d.toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });

export default async function Benachrichtigungen({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { user, familyId } = await requireFamily();
  const sp = await searchParams;
  const fehler = one(sp.fehler);
  const ok = one(sp.ok);
  // The bell syncs at most every few minutes; this page always shows what is due now.
  await syncAndCount(user.id, familyId).catch(() => 0);
  const rows = await listNotifications(user.id, familyId);
  const unread = rows.filter((r) => !r.readAt).length;
  return (
    <div className="max-w-2xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Benachrichtigungen</h1>
        <Link href="/benachrichtigungen/einstellungen" className="inline-flex min-h-11 items-center text-sm underline">Einstellungen und Kalender-Abo</Link>
      </div>
      {fehler ? <Notice kind="error">{errorMessages[fehler] ?? "Das hat nicht geklappt."}</Notice> : null}
      {ok ? <Notice kind="ok">{okMessages[ok] ?? "Gespeichert."}</Notice> : null}
      {unread > 0 ? (
        <form action={markAllReadAction}>
          <button className={ghostButtonCls}>Alle als gelesen markieren</button>
        </form>
      ) : null}
      {rows.length === 0 ? (
        <p className="text-stone-600">Keine Benachrichtigungen. Hier erscheinen fällige Aufgaben, Routinen, Geburtstage und neue Zuweisungen.</p>
      ) : (
        <ul className="divide-y divide-stone-200 rounded-2xl bg-white shadow-sm ring-1 ring-stone-200" data-testid="notification-list">
          {rows.map((n) => (
            <li key={n.id}>
              <form action={openNotificationAction}>
                <input type="hidden" name="id" value={n.id} />
                <button className="flex min-h-11 w-full items-start gap-3 px-4 py-3 text-left hover:bg-stone-50">
                  <span aria-hidden="true" className={`mt-2 h-2 w-2 shrink-0 rounded-full ${n.readAt ? "bg-transparent" : "bg-terracotta"}`} />
                  <span className="min-w-0 flex-1">
                    <span className={`block break-words ${n.readAt ? "text-stone-600" : "font-medium"}`}>{n.title}</span>
                    <span className="block text-xs text-stone-500">
                      {fmt(n.createdAt)}
                      {n.readAt ? "" : " · ungelesen"}
                    </span>
                  </span>
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
