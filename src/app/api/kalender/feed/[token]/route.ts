import { buildIcs } from "@/lib/ics-export";
import { clientIp } from "@/server/client-ip";
import { baseUrl } from "@/server/env";
import { assertBelowLimit, rateLimit, recordHit } from "@/server/ratelimit";
import { feedData, resolveFeed } from "@/server/services/notifications";
import { hashToken } from "@/server/tokens";

export const dynamic = "force-dynamic";

/** Per feed link: calendar services refresh a few times an hour at most. */
const FEED_LIMIT = { max: 60, windowMs: 60 * 60 * 1000 } as const;
/**
 * Per client address, only unknown links count: guessing is braked, but Google or Apple fetching many
 * valid feeds from shared addresses are not.
 */
const FEED_MISS_LIMIT = { max: 30, windowMs: 60 * 60 * 1000 } as const;

const notFound = () => new Response("Nicht gefunden", { status: 404, headers: { "Cache-Control": "no-store" } });
const tooMany = () => new Response("Zu viele Abrufe", { status: 429, headers: { "Retry-After": "3600" } });

/** Private ICS feed: /api/kalender/feed/<token>.ics. The token is the only credential (docs/benachrichtigungen.md). */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const missKey = `feed:miss:${clientIp(req.headers) ?? "unknown"}`;
  try {
    assertBelowLimit(missKey, FEED_MISS_LIMIT.max);
  } catch {
    return tooMany();
  }
  const raw = (await params).token;
  const token = raw.endsWith(".ics") ? raw.slice(0, -4) : raw;
  const who = await resolveFeed(token);
  if (!who) {
    recordHit(missKey, FEED_MISS_LIMIT.windowMs);
    return notFound();
  }
  try {
    rateLimit(`feed:token:${hashToken(token)}`, FEED_LIMIT.max, FEED_LIMIT.windowMs);
  } catch {
    return tooMany();
  }
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
