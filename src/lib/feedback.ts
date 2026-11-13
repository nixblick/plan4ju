// Pure helpers for the feedback widget: input limits, image check, mail text. No I/O here.

export const FEEDBACK_KINDS = { BUG: "Fehler", IDEA: "Idee", OTHER: "Sonstiges" } as const;
export type FeedbackKindKey = keyof typeof FEEDBACK_KINDS;
export const MAX_MESSAGE = 5000;
export const MAX_NAME = 100;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const FEEDBACK_LIMIT = { max: 10, windowMs: 60 * 60 * 1000 } as const;

export function isFeedbackKind(v: string): v is FeedbackKindKey {
  return Object.hasOwn(FEEDBACK_KINDS, v);
}

/** PNG or JPEG by magic bytes, never by the declared type or file name. */
export function sniffImage(b: Uint8Array): "image/png" | "image/jpeg" | null {
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (b.length >= 8 && png.every((v, i) => b[i] === v)) return "image/png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  return null;
}

/**
 * Path only: no query, no fragment, no secret tokens in the path (invitation links),
 * printable ASCII, at most 200 characters.
 */
export function sanitizePath(raw: string): string {
  let p = raw.split(/[?#]/, 1)[0] ?? "";
  if (!p.startsWith("/")) p = "/";
  p = p.replace(/[^\x21-\x7e]/g, "");
  p = p.replace(/^\/einladung\/[^/]+/, "/einladung/[token]");
  return p.slice(0, 200) || "/";
}

/** Rough browser and device, never the full user agent. */
export function deviceSummary(ua: string): string {
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows"
    : /Mac OS X|Macintosh/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "unbekannt";
  const browser = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /OPR\//.test(ua) ? "Opera"
    : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "unbekannt";
  const kind = /Mobi|iPhone|Android.*Mobile/.test(ua) ? "Handy" : /iPad|Tablet|Android/.test(ua) ? "Tablet" : "Computer";
  return `${browser} auf ${os} (${kind})`;
}

/** One header line: no line breaks or control characters (header injection), at most `max` characters. */
export function oneLine(s: string, max: number): string {
  const flat = s.replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, " ").replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

export interface FeedbackMailInput {
  kind: FeedbackKindKey;
  message: string;
  authorName: string | null;
  pagePath: string;
  appVersion: string;
  device: string;
  screenWidth: number | null;
  familyId: string;
  role: string;
  createdAt: Date;
  hasImage: boolean;
}

/** Short internal family id: enough to find the row, nothing personal. */
export const familyShort = (id: string) => id.slice(-8);

export function feedbackSubject(f: Pick<FeedbackMailInput, "kind" | "message">): string {
  return oneLine(`[Plan4JU Feedback] ${FEEDBACK_KINDS[f.kind]}: ${oneLine(f.message, 60)}`, 120);
}

/** Plain text body (sent as text/plain only, so no HTML can be injected). */
export function feedbackText(f: FeedbackMailInput): string {
  return [
    `Art:      ${FEEDBACK_KINDS[f.kind]}`,
    `Name:     ${f.authorName ? oneLine(f.authorName, 100) : "nicht angegeben"}`,
    `Seite:    ${f.pagePath}`,
    `Version:  ${f.appVersion}`,
    `Gerät:    ${f.device}`,
    `Breite:   ${f.screenWidth ? `${f.screenWidth} px` : "unbekannt"}`,
    `Familie:  ${familyShort(f.familyId)} (Rolle ${f.role})`,
    `Zeit:     ${f.createdAt.toISOString()}`,
    `Bild:     ${f.hasImage ? "im Anhang" : "keins"}`,
    "",
    "Text:",
    f.message,
    "",
  ].join("\n");
}
