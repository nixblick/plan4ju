import { NOT_FOUND_HTML, renderSharedList } from "@/lib/shared-wishlist-html";
import { clientIp } from "@/server/client-ip";
import { rateLimit } from "@/server/ratelimit";
import { resolveShare } from "@/server/services/wishes";
import { hashToken } from "@/server/tokens";

export const dynamic = "force-dynamic";

/** Per link: enough for a family passing it around, a brake on scraping. */
const SHARE_LIMIT = { max: 120, windowMs: 60 * 60 * 1000 } as const;
/** Per client address, only failed lookups count, so guessing is braked. */
const SHARE_MISS_LIMIT = { max: 30, windowMs: 60 * 60 * 1000 } as const;
/** Failed lookups without a client address share one large global budget instead of a small common pot. */
const SHARE_MISS_GLOBAL_LIMIT = { max: 3000, windowMs: 60 * 60 * 1000 } as const;

const HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
};

const notFound = () => new Response(NOT_FOUND_HTML, { status: 404, headers: HEADERS });
const tooMany = () => new Response("Zu viele Abrufe", { status: 429, headers: { ...HEADERS, "Content-Type": "text/plain; charset=utf-8", "Retry-After": "3600" } });

/** Shared wish list: /geteilt/wunschzettel/<token>. The token is the only credential (docs/wunschzettel.md). */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const token = (await params).token;
  // Look up first: a valid link is never blocked by failed attempts of others (only its own per-link limit applies).
  const list = await resolveShare(token);
  if (!list) {
    const ip = clientIp(req.headers);
    try {
      if (ip) rateLimit(`share:miss:ip:${ip}`, SHARE_MISS_LIMIT.max, SHARE_MISS_LIMIT.windowMs);
      else rateLimit("share:miss:global", SHARE_MISS_GLOBAL_LIMIT.max, SHARE_MISS_GLOBAL_LIMIT.windowMs);
    } catch {
      return tooMany();
    }
    return notFound();
  }
  try {
    rateLimit(`share:token:${hashToken(token)}`, SHARE_LIMIT.max, SHARE_LIMIT.windowMs);
  } catch {
    return tooMany();
  }
  return new Response(renderSharedList(list), { headers: HEADERS });
}
