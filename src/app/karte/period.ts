const de = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
};

/** "21.11.2026" or "20.11.2026 – 22.11.2026". */
export function periodText(start: string, end: string | null): string {
  return !end || end === start ? de(start) : `${de(start)} – ${de(end)}`;
}
