/**
 * Optional analytics snippet. Active only when ANALYTICS_SCRIPT_URL is set (read at runtime).
 * ANALYTICS_SITE is passed as data-site. Nothing is hard-coded; without the variable no script is emitted.
 */
export type AnalyticsConfig = { src: string; site: string | null; origin: string };

export function analyticsConfig(env: Record<string, string | undefined> = process.env): AnalyticsConfig | null {
  const raw = env.ANALYTICS_SCRIPT_URL?.trim();
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    const site = env.ANALYTICS_SITE?.trim() || null;
    return { src: u.toString(), site, origin: u.origin };
  } catch {
    return null;
  }
}
