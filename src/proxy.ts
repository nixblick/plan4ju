import { NextResponse, type NextRequest } from "next/server";
import { analyticsConfig } from "./server/analytics";
import { mapConfig } from "./server/map-config";

// Content Security Policy, built per request so the optional analytics origin (runtime env) can be allowed.
// Next.js emits inline bootstrap scripts, so script-src needs 'unsafe-inline' (a nonce would force every page
// to be rendered dynamically per request). Everything else is locked to the own origin.
export function buildCsp(dev: boolean, analyticsOrigin?: string, tileOrigin?: string): string {
  const extra = analyticsOrigin ? ` ${analyticsOrigin}` : "";
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}${extra}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data:${tileOrigin ? ` ${tileOrigin}` : ""}`,
    "font-src 'self'",
    `connect-src 'self'${dev ? " ws: wss:" : ""}${extra}`,
    "manifest-src 'self'",
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

export function proxy(_req: NextRequest) {
  const res = NextResponse.next();
  res.headers.set(
    "Content-Security-Policy",
    buildCsp(process.env.NODE_ENV !== "production", analyticsConfig()?.origin, mapConfig().tileOrigin ?? undefined),
  );
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
