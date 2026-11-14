// Old addresses of 0.7 and before, redirected so bookmarks and stored notification links keep working
// (Release 0.8: "Feste" became "Reminder", "Familie" became "Einstellungen", birthdays moved into the calendar).
// Plain .mjs because next.config.mjs imports it; tests import it too.

/** @type {{ source: string; destination: string }[]} */
export const LEGACY_ROUTES = [
  { source: "/geburtstage", destination: "/kalender/geburtstage" },
  { source: "/familie", destination: "/einstellungen/mitglieder" },
  { source: "/familie/:path*", destination: "/einstellungen/:path*" },
];

/** For next.config.mjs: temporary (307), so a later rename stays possible; the query string is kept by Next.js. */
export function legacyRedirects() {
  return LEGACY_ROUTES.map((r) => ({ ...r, permanent: false }));
}
