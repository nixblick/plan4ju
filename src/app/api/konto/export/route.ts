import { getSessionUser } from "@/server/session";
import { rateLimit } from "@/server/ratelimit";
import { exportOwnData } from "@/server/services/privacy";

export const dynamic = "force-dynamic";

/** Download of the own data as JSON (docs/datenschutz.md). Session cookie only, 10 per hour. */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return new Response("Nicht angemeldet", { status: 401, headers: { "Cache-Control": "no-store" } });
  try {
    rateLimit(`export:${user.id}`, 10, 60 * 60 * 1000);
  } catch {
    return new Response("Zu viele Abrufe", { status: 429, headers: { "Retry-After": "3600", "Cache-Control": "no-store" } });
  }
  const data = await exportOwnData(user.id);
  const day = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="plan4ju-daten-${day}.json"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
