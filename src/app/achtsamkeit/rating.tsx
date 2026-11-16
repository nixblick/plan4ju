import { CIRCLE_COLORS, RATINGS, type RatingSymbol } from "@/lib/achtsamkeit";

/**
 * One rating as the user's chosen symbol (decorative: the caller provides the text for screen readers).
 * Circles carry their number and a darker border, so they never rely on colour alone.
 */
export function RatingMark({ r, symbol, size = "md" }: { r: number; symbol: RatingSymbol; size?: "sm" | "md" }) {
  const rr = Math.min(5, Math.max(1, Math.round(r)));
  if (symbol === "CIRCLE") {
    const c = CIRCLE_COLORS[rr]!;
    const dim = size === "sm" ? "h-5 w-5 text-[10px]" : "h-8 w-8 text-sm";
    return (
      <span
        aria-hidden="true"
        data-testid="rating-circle"
        className={`inline-flex shrink-0 items-center justify-center rounded-full border-2 align-middle font-semibold text-stone-800 ${dim}`}
        style={{ backgroundColor: c.fill, borderColor: c.border }}
      >
        {rr}
      </span>
    );
  }
  return <span aria-hidden="true" className={size === "sm" ? "" : "text-2xl"}>{RATINGS[rr]!.emoji}</span>;
}
