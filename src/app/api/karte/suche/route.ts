import { GeocodeBusyError, normaliseQuery, searchAddress } from "@/server/geocode";
import { rateLimit } from "@/server/ratelimit";
import { getModules } from "@/server/services/modules";
import { activeFamilyId, getSessionUser } from "@/server/session";

export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "private, no-store", ...extra },
  });

/**
 * Address search for the POI form (docs/karte.md). Signed in, active family with the POI module on, at most
 * 20 searches per user and minute; the server-wide Nominatim limit is in geocode.ts. The text is not logged.
 */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return json({ error: "anmelden" }, 401);
  const familyId = await activeFamilyId(user);
  if (!familyId) return json({ error: "familie" }, 403);
  if (!(await getModules(user.id, familyId)).map) return json({ error: "modul-aus" }, 404);
  const q = normaliseQuery(new URL(req.url).searchParams.get("q") ?? "");
  if (!q) return json({ error: "eingabe" }, 400);
  try {
    rateLimit(`geocode:${user.id}`, 20, 60_000);
  } catch {
    return json({ error: "zu-viele" }, 429, { "Retry-After": "60" });
  }
  try {
    return json({ results: await searchAddress(q) });
  } catch (e) {
    if (e instanceof GeocodeBusyError) return json({ error: "beschaeftigt" }, 429, { "Retry-After": "5" });
    return json({ error: "dienst" }, 502);
  }
}
