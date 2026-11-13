import { buildIcs } from "@/lib/ics-export";
import { clientIp } from "@/server/client-ip";
import { baseUrl } from "@/server/env";
import { rateLimit } from "@/server/ratelimit";
import { feedData, resolveFeed } from "@/server/services/notifications";

export const dynamic = "force-dynamic";

const notFound = () => new Response("Nicht gefunden", { status: 404, headers: { "Cache-Control": "no-store" } });

/** Private ICS feed: /api/kalender/feed/<token>.ics. The token is the only credential (docs/benachrichtigungen.md). */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    rateLimit(`feed:${clientIp(req.headers) ?? "unknown"}`, 60, 60 * 60 * 1000);
  } catch {
    return new Response("Zu viele Abrufe", { status: 429, headers: { "Retry-After": "3600" } });
  }
  const raw = (await params).token;
  const token = raw.endsWith(".ics") ? raw.slice(0, -4) : raw;
  const who = await resolveFeed(token);
  if (!who) return notFound();
  const data = await feedData(who.userId, who.familyId);
  const body = buildIcs({ name: `Plan4JU ${data.familyName}`, tz: data.tz, items: data.items, birthdays: data.birthdays, host: new URL(baseUrl()).hostname });
  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="plan4ju.ics"',
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex",
    },
  });
}
