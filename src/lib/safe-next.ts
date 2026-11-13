const BASE = "http://plan4ju.invalid";

/** Control characters, any whitespace (incl. Unicode spaces) and backslashes. */
function hasUnsafeChar(v: string): boolean {
  for (const ch of v) {
    const c = ch.codePointAt(0)!;
    if (c <= 0x20 || (c >= 0x7f && c <= 0xa0) || ch === "\\" || /\s/u.test(ch) || c === 0x200b || c === 0xfeff) return true;
  }
  return false;
}

/**
 * Only same-origin paths are valid redirect targets (no open redirect). The value is parsed
 * like a browser would; control characters, whitespace and backslashes are rejected before,
 * because browsers strip or reinterpret them (`/\t/evil` becomes `//evil`).
 */
export function safeNext(value: FormDataEntryValue | string | null | undefined): string | null {
  if (typeof value !== "string" || value === "") return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  if (hasUnsafeChar(value)) return null;
  let url: URL;
  let path: string;
  try {
    url = new URL(value, BASE);
    path = decodeURIComponent(url.pathname);
  } catch {
    return null;
  }
  if (url.origin !== BASE) return null;
  // Encoded tabs or slashes in the path (`/%09/x`, `/%2F/x`) are rejected as well.
  if (hasUnsafeChar(path) || path.startsWith("//")) return null;
  const out = `${url.pathname}${url.search}${url.hash}`;
  return out.startsWith("//") ? null : out;
}
