/** Only same-site paths are valid redirect targets (no open redirect). */
export function safeNext(value: FormDataEntryValue | string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return null;
  return value;
}
