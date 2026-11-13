/**
 * Client address for rate limits. X-Forwarded-For is appended to by every proxy, so only
 * entries added by our own proxies can be trusted: with TRUSTED_PROXY_HOPS = n (default 1)
 * the n-th entry from the right is the address the outermost trusted proxy saw. Everything
 * left of it is client controlled. X-Real-IP is used only when TRUSTED_REAL_IP=true says the
 * proxy always overwrites it. TRUSTED_PROXY_HOPS=0 means no proxy: forwarded headers are ignored.
 * Without a trusted address the result is null; callers then use one shared bucket ("unknown"),
 * Better Auth its own shared bucket, so the limits still apply.
 */
export const CLIENT_IP_HEADER = "x-plan4ju-client-ip";

export function trustedProxyHops(env: Record<string, string | undefined> = process.env): number {
  const raw = env.TRUSTED_PROXY_HOPS;
  if (raw === undefined || raw.trim() === "") return 1;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= 10 ? n : 1;
}

export function trustRealIp(env: Record<string, string | undefined> = process.env): boolean {
  return env.TRUSTED_REAL_IP === "true";
}

export function clientIp(h: Headers, hops = trustedProxyHops(), realIp = trustRealIp()): string | null {
  if (hops === 0) return null;
  const xff = h.get("x-forwarded-for");
  if (xff) {
    const parts = xff.split(",").map((s) => s.trim());
    const ip = parts.length >= hops ? parts[parts.length - hops] : undefined;
    if (ip) return ip;
  }
  return (realIp && h.get("x-real-ip")?.trim()) || null;
}

/** Copy of the headers with the trusted client address in CLIENT_IP_HEADER (for Better Auth). */
export function withClientIp(h: Headers, hops = trustedProxyHops(), realIp = trustRealIp()): Headers {
  const out = new Headers(h);
  out.delete(CLIENT_IP_HEADER);
  const ip = clientIp(h, hops, realIp);
  if (ip) out.set(CLIENT_IP_HEADER, ip);
  return out;
}
