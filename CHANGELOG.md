# Changelog

## 0.7.2 (14.11.2026)

Code review: errors, load and token costs.

- Daily digest: a failed mail no longer loses the day. The new SECURITY DEFINER function `app_digest_unclaim` gives the claim back, so the next run that day retries. The mail lists only what is due today and still unread, with today's titles: no stale "Morgen hat … Geburtstag" from yesterday, and no doubled lines. A task that was due yesterday now reads "Überfällig".
- Bell: notifications are generated at most every 5 minutes per user and family. They are generated at once after a change to tasks, assignments, birthdays, routines or preferences in the family (`withFamilyChange`), and always on `/benachrichtigungen`. In between the root layout only counts (one query instead of about a dozen plus writes per page). Session user and family membership are read once per request (`cache()`). The Better Auth cookie cache stays off on purpose, so "sign out everywhere" still takes effect at once.
- Calendar: a series loads only the exceptions in the window: rule day in the window, at most `MAX_EVENT_DAYS` before it, or moved into it. They are ordered and no longer cut to an arbitrary 500, so cancellations in long series cannot reappear.
- ICS feed: the rate limit counts per feed link (hashed), not per address. Calendar services that fetch from shared addresses are no longer locked out. Only unknown links count per address (30 per hour), against guessing.
- Pictures: removing a recipe or wish picture needs the module to be on, as setting and reading already did.
- Feedback: after a successful delivery the screenshot (`image`, `imageType`) is cleared, because it went out as the attachment. Existing rows are unchanged.
- AI recipe idea: the default model is now `claude-haiku-4-5` (`AI_MODEL` still overrides it). `max_tokens` drops from 2000 to 1200. The recipe comes back through a forced tool call with a schema instead of free-text JSON; text is kept as a fallback. New limits on top of 20 per family and hour: 30 per family and day, and 300 per day for all families together.
- Open: routine rotation after a rule change (#17).
- Tests: `tests/feed-route.test.ts`, `tests/notification-sync.test.ts`, plus new cases for the digest retry, digest titles, exceptions of a long series, pictures with a module off, feedback screenshot removal, AI tool call and daily limit.

## 0.7.1 (14.11.2026)

- New logo "Wochenhaus" (terracotta square, white house, seven pastel dots for the week; small variant without dots) and the wordmark "plan4ju" (Outfit 700, outlined, the 4 in terracotta). Sources in `assets/`, all PNGs, `favicon.ico` and the `public/` copies are rendered reproducibly by `scripts/render-assets.sh`; `scripts/wordmark.py` outlines the wordmark.
- Icons: `icon.svg`, `favicon.ico` (16/32/48), `apple-touch-icon.png` 180 px full-bleed without transparency, PWA icons 192/512 plus a maskable 512 icon, `og-image.png` 1280x640. Metadata: favicon, Apple icon, manifest link, theme color `#C65D3B`, Open Graph image (absolute via `BETTER_AUTH_URL`).
- Header, sign-in page and invitation page show logo and wordmark. The sign-in page for guests gets the hero illustration and four feature illustrations (tasks, routines, food and shopping, leisure and wishes), works at 375 px.
- Colors: brand `#C65D3B` only for logo and decoration; buttons, links and active states use `#A2462B` (white text 6.1:1, AA); text color `#2B2522`. Outfit self-hosted via `next/font/local` (CSP unchanged).
- Tests: Playwright checks manifest (maskable icon, theme color), Apple icon type, logo and Open Graph links in the HTML and the guest page at 375 px without horizontal scrolling.

## 0.7.0 (14.11.2026)

- Achtsamkeit as a compact questionnaire (#15): person and date on top, all six topics below each other with the emoji scale, one "Absenden" stores one entry with all ratings. All topics are preselected, none is required (unticked or unrated topics are skipped, at least one rating). Visibility is now a setting per user ("Sichtbar für" at the top of the page, new table `mindfulness_pref`, own row only), copied into each row on submit; existing entries keep their visibility. Health under "Ganze Familie" stays private. New column `mindfulness_entry.checkinId` groups the rows of one submit; migration gives every existing row its own check-in (no data change). History shows one entry per submit, deleting removes the whole entry.
- Aufgaben with tabs "Neu" and "Aufgaben" like the routines (shared `SubTabs` component) (#16). The list shows "Meine" first and a block "Nicht zugewiesen" below; the filter "Alle" (plus Erledigt, Archiv) shows everything. Ticking a task keeps the current list view.
- Assignment acceptance (#16): assigning someone else marks the assignment "neu zugewiesen" (`task_assignment.state` PENDING, `assignedById`); the person sees a marker in the list, a bell notification and "Annehmen"/"Ablehnen" in the list and on the task page. Declining removes the assignment (unassigned again unless others are assigned) and notifies the assigning person (new table `task_decline`, notification kind `DECLINED`). Self-assignment and child profiles without login are accepted automatically; editing a task keeps the states of unchanged assignees. Existing assignments are migrated as accepted. RLS: restrictive policies on `task_assignment` (only the assigned person accepts, nobody inserts an accepted row for another member or in someone else's name), `task_decline` readable only by the two people involved.
- Tests: `tests/assignments.test.ts`, `tests/mindfulness-checkin.test.ts` (incl. migration), RLS cases for the new policies and tables (38 tables), Playwright `tests-e2e/abnahme-0.7.spec.ts` at 375 px; existing specs adapted to the new task tabs and the questionnaire.

## 0.6.1 (14.11.2026)

- Security (#14): the feedback retry counts an attempt BEFORE sending, through the new SECURITY DEFINER functions `app_feedback_claim` / `app_feedback_finish` (fixed `search_path`, only `mailAttempts`, `mailNextAt`, `mailedAt`, `mailFailedAt`; EXECUTE for `plan4ju_app` only). Feedback whose author left the family is marked failed instead of being resent endlessly. Each row runs in its own try/catch, so one broken row no longer stops the job.
- `/familie/meldungen`: owners see kind, date and attempts of other members' feedback; the text is only returned by the server for the viewer's own feedback.
- Tests: author left the family, broken row, owner does not see foreign text (vitest and Playwright).

## 0.6.0 (14.11.2026)

- Release 0.6: data export and account/family deletion (0.5.16), move or cancel single instances of a series (0.5.17/0.5.18), pictures for recipes and wishes (0.5.19), background refresh of calendar subscriptions (0.5.20), retry of undelivered feedback mails (0.5.21/0.5.22).
- New acceptance spec `tests-e2e/abnahme-0.6.spec.ts` (part of `npm run test:abnahme`): export carries only own data, a member deletes the own account, one series instance is moved, an uploaded picture is visible only to the own family. 375 px.

## 0.5.22 (14.11.2026)

- Feedback retry: the job no longer picks up feedback whose first delivery is still running (no duplicate mail).

## 0.5.21 (14.11.2026)

- Feedback mails are retried. A failed delivery counts as attempt 1; the job `POST /api/jobs/kalender` (same `JOB_TOKEN`) now also retries due feedback with `mailedAt` empty, with backoff 5 min, 30 min, 2 h, 12 h; after 5 attempts the row is marked failed (`mailFailedAt`) and not tried again. Without `FEEDBACK_MAIL_TO` nothing is attempted. The new SECURITY DEFINER function `app_feedback_retry_due` only lists; each retry reads and updates the row under RLS as the author (if still a member) or an owner. New columns `mailAttempts`, `mailNextAt`, `mailFailedAt` on `feedback`. Owners see "Meldungen, die nicht zugestellt wurden" at `/familie/meldungen` (link on the module page); other roles get 404. Tests: new `tests/feedback-retry.test.ts`.

## 0.5.20 (14.11.2026)

- Calendar subscriptions are refreshed in the background. New `POST /api/jobs/kalender` (only with `JOB_TOKEN` from the environment, at least 32 characters, else 404) refreshes every enabled, not paused subscription of all families that is due by its own interval (15 min, hourly default, 6 h, daily; set per calendar under "Name und Farbe"); answers counts only. The new SECURITY DEFINER function `app_calendar_refresh_due` only lists; each fetch runs through `syncCalendar` under RLS as a current member. Failed fetches are counted; after 5 in a row the subscription is paused (job and page skip it, the list shows "pausiert"); a successful "Jetzt abrufen" resumes it. Lazy refresh on page load uses the interval too. New columns `refreshMinutes` (check constraint), `failCount`, `pausedAt` on `external_calendar`. `docs/kalender.md` shows the systemd timer and the cron line. Tests: new `tests/calendar-refresh.test.ts`.

## 0.5.19 (14.11.2026)

- Pictures for recipes and wishes. Upload PNG, JPEG or WebP up to 5 MB on the recipe page and on a wish (whoever may edit the list); one picture per recipe/wish, replace or remove. The type comes from the magic bytes only. Metadata is removed without a native dependency by rebuilding the container from a whitelist (`src/lib/image-clean.ts`): JPEG keeps only JFIF/Adobe and the decoding segments and is cut after the first image end (drops EXIF/GPS, XMP, IPTC, ICC, comments, MPF trailers); PNG keeps the display chunks (drops text, eXIf, tIME, data after IEND; CRCs checked); WebP drops EXIF/XMP and clears their VP8X flags. The pixels are copied, not re-encoded; because the EXIF orientation is gone, portrait phone photos can appear rotated. Files that do not parse cleanly are refused. New table `image` (bytea, familyId, composite FKs to recipe/wish with cascade, exactly one owner, ENABLE+FORCE RLS, policy, grants). Served only by `GET /api/bild/<id>`: active family, module on and recipe/wish visible to the user, else 404; `no-store`, `nosniff`, sandbox CSP. Page CSP `img-src 'self'` unchanged. Tests: new `tests/images.test.ts` (metadata markers removed in all three formats, wrong/broken files refused, foreign family and signed-out get 404 from the route, replace/remove/cascade, module off, a private wishlist picture stays hidden from other members), `tests/rls.test.ts` counts 36 tables.

## 0.5.18 (14.11.2026)

- Calendar: an instance of a series moved before its start or after its end is shown again; the query also loads series with a moved instance in the window. Test in `tests/series-exceptions.test.ts`.

## 0.5.17 (14.11.2026)

- Single instances of a series. Calendar: one instance of a repeated event can be moved (other day and/or time) or cancelled on its own page `/kalender/termin/<id>/<rule day>` and put back with "Wie in der Serie"; the series stays as it is. New table `calendar_event_exception` (familyId, composite FK to the event, ENABLE+FORCE RLS, policy, grants), unique per event and rule day; timed moves are stored as UTC instants from the family zone, so DST is handled; exceptions on days that are no longer rule days are ignored. Moved instances show "verschoben vom TT.MM.". Routines: besides "Überspringen" an occurrence can now be moved to another day and time ("Verschieben"); the new column `routine_occurrence.movedFrom` keeps the rule day, so it is not generated again, also after a routine change; a day that already has the routine is refused. Tests: new `tests/series-exceptions.test.ts` (expansion over the autumn DST change, service, isolation, routines), `tests/rls.test.ts` counts 35 tables, new `tests-e2e/serie-einzeln.spec.ts` at 375 px.
- Routine occurrences assigned by hand keep the label "einzeln zugewiesen" (E2E `dashboard.spec.ts` was red after the first commit).

## 0.5.16 (14.11.2026)

- Privacy (masterprompt section 20): data export, account deletion and family deletion on `/konto`. `GET /api/konto/export` returns the user's own data as JSON (account, memberships, own entries, own mindfulness, own feedback without screenshots), built with the restricted role per family context. Account deletion needs the password; the last owner of a family is refused (service and trigger) and shown which family to hand over or delete. An owner deletes the active family by typing its name. New migration `privacy_delete` with the SECURITY DEFINER functions `app_delete_own_account()` and `app_delete_active_family()` (context only, no arguments) and `owner_all` policies on `feedback` and `wish_reservation`. New `docs/datenschutz.md` (contents, deletion concept, retention, operator duties). Tests: new `tests/privacy.test.ts` (export without foreign data, deletion removes everything personal, last owner, RLS of the functions), new `tests-e2e/datenschutz.spec.ts` at 375 px (users created directly, no sign-up, to stay under the sign-up limit). `einkauf.spec.ts` matches the "Konto" heading exactly (the new "Konto löschen" card).

## 0.5.15 (14.11.2026)

- Start page: "in N Minuten" under "Als Nächstes" and the now line on "Heute zu Hause" no longer freeze at page load. A shared one-minute client tick in `clock.tsx` (`useNow`, `NextIn`, `NowLine`) recomputes both; new pure `nextInText` in `today-agenda.ts`. Tests: new cases in `tests/today-agenda.test.ts`, new E2E case in `tests-e2e/heute.spec.ts` (Playwright clock, line appears and moves without reload).

## 0.5.14 (14.11.2026)

- Modules: a server action against a switched-off module now redirects with `fehler=modul-aus` and shows "Dieses Modul ist ausgeschaltet." instead of "Eintrag nicht gefunden.". New `ModuleOffError` (subclass of `NotFoundError`, so pages still answer 404), mapped in `action-helpers.ts`, `actions.ts` and `planung-actions.ts`. Vitest gets the `@/` alias. New `tests/module-off-message.test.ts`, extra case in `tests/modules.test.ts`.

## 0.5.13 (14.11.2026)

- Navigation: the bottom tab "Geburtstage" is now "Feste" (sub tabs Geburtstage, Wunschzettel, Karte), so the map is findable; still 7 tabs, labels never wrap. Achtsamkeit gets a tile on the start page (only with the module on) and stays under Familie. New E2E case in `tests-e2e/module.spec.ts` at 375 px: 7 tabs in one line, every target at least 44 px.

## 0.5.12 (14.11.2026)

- Heute: "Als Nächstes" now shows entries that are running right now and multi-day events that began yesterday or earlier (filter `end > now` instead of `start >= now`), labelled "läuft seit 09:00" / "läuft seit gestern 20:00". The E2E check uses a multi-day event from yesterday to tomorrow, so it no longer depends on the time of day. New cases in `tests/today-agenda.test.ts`.

## 0.5.11 (14.11.2026)

- Karte: an expired temporary point is now archived when its detail page (`/karte/[id]`) or the creator filter is loaded, not only when the list is read, so the detail page no longer shows a past event as active. `getPoi` and `listPoiCreators` run `archiveExpired` first. New case in `tests/map.test.ts`.

## 0.5.10 (14.11.2026)

- Essen: planning or editing a meal while its recipe (or slot, cook profile) is deleted at the same moment no longer ends in a 500. The meal services' constraint helper now maps a foreign key violation (P2003) to `NotFoundError`, so the page shows the "nicht gefunden" notice; P2002 stays a conflict. New cases in `tests/meals.test.ts`.

## 0.5.9 (14.11.2026)

- Einkauf: merging a recipe ingredient into an open entry no longer produces a quantity above 100,000 that could not be saved anymore. `mergeAmounts` returns null above `SHOPPING_LIMITS.quantity`, so the ingredient becomes a new line; the Zod schema uses the same limit. New cases in `tests/shopping.test.ts`.

## 0.5.8 (14.11.2026)

- Achtsamkeit: saving a rating twice at the same moment (double submit) no longer ends in a 500. `saveEntry` now uses an upsert (`INSERT ... ON CONFLICT`) on the unique key instead of look-up-then-create. New race case in `tests/mindfulness.test.ts`.

## 0.5.7 (14.11.2026)

- Assignments of tasks, routines and routine occurrences now keep the profile inside the row's family at database level: migration `assignment_profile_family_fk` (appended) replaces the single `profileId` foreign keys with composite `(profileId, familyId)` keys like `meal_cook`. Before, only the services checked it. New case in `tests/routines.test.ts`.

## 0.5.6 (14.11.2026)

- Wunschzettel: the wishing person no longer sees reservation rows (and `reservedById`) at database level, also outside surprise mode. Migration `wish_reservation_wisher` (appended) narrows the `wish_reservation` policy; the taken flag comes from the SECURITY DEFINER function `app_wish_reserved_for_wisher` (wish ids only). New case in `tests/rls.test.ts`.

## 0.5.5 (14.11.2026)

Release 0.5 vollständig abgenommen (v0.5.0 war schon getaggt und live, daher als 0.5.5): umfasst die Kernmodule-Schalter (0.5.2), Benachrichtigungen und das private Kalender-Abo (0.5.3, 0.5.4).

- Acceptance `abnahme-0.5` extended: core modules (Karte, Wunschzettel, Achtsamkeit, Essen) off without hurting the core and without touching the other family, notifications for a due task and a birthday tomorrow (not visible to the other family), private ICS feed with only the own family's dates and revocation (404 afterwards), 375 px for the notification pages.
- Abnahme gegen den Produktionscontainer mit zwei erfundenen Familien: `abnahme-0.5` 10 von 10 grün, `abnahme-0.4` 8 von 8, `abnahme-0.3` 7 von 7, `abnahme-0.2` 7 von 7; Vitest 486 von 486, Lint und Typecheck sauber.

## 0.5.4 (14.11.2026)

- Kalender-Abo: semicolons in titles, places and descriptions are escaped correctly in the ICS feed (RFC 5545); the test checked the wrong value.

## 0.5.3 (14.11.2026)

- Benachrichtigungen: bell with unread count (header on phones, sidebar from `md`), list `/benachrichtigungen`, generated lazily on page load for the signed-in user (due/overdue tasks, today's routines, birthdays today and tomorrow, new assignments by others within 7 days), deduplicated, old ones cleaned up. Settings per user and family (`/benachrichtigungen/einstellungen`).
- Kalender-Abo: private ICS feed per user (`/api/kalender/feed/<token>.ics`, events and birthdays, 30 days back to one year ahead), shown once, stored as hash only, renewable and revocable, dead when the member leaves; rate limited.
- Optional daily e-mail digest (off by default) via `POST /api/jobs/digest` with `NOTIFY_JOB_TOKEN` from the environment (404 without it).
- Migrations `notifications`, `notifications_rls` (appended): tables `notification`, `notification_pref`, `calendar_feed` with forced RLS (own rows only, also for owners), FK to the membership, `task_assignment.createdAt` (backfilled from the task, migration `assignment_backfill`, so existing assignments do not show up as new); SECURITY DEFINER functions `app_calendar_feed_lookup`, `app_digest_claim`. Web-Push not built (needs a vendor push service), see `docs/benachrichtigungen.md`.

## 0.5.2 (14.11.2026)

- Module: Essen und Rezepte, Wunschzettel, Karte und Achtsamkeit are switchable per family too (on by default, admins only, DB trigger extended). Migration `core_modules` (appended). Off is enforced in the services (`withModule`), pages answer 404, sub tabs, the meal tile and wish list links disappear; without meal planning the Essen tab leads to the shopping list. Switching off deletes nothing.
- Abfuhr tile: pickups say "Heute" or "Morgen" (family time zone) instead of a bare date.
- Tests: `modules.test.ts` (new switches, trigger, NotFound per service, core functions with all off, other family untouched), `module.spec.ts` (switch four modules off and on, 375 px).

## 0.5.1 (14.11.2026)

- E2E `module.spec.ts` (runs in CI, no sign-up, 375 px): modules start off, a member sees no switches, the owner switches Prospekte on and off, the page is 404 while off.

## 0.5.0 (13.11.2026)

Release 0.5 "Optionale Integrationen": Zusatzmodule je Familie unabhängig an- und abschaltbar (Prospekte, Abfallkalender), Prospekte als Links zu den Händlern, Abfuhrtermine aus einem eigenen ICS-Kalender mit Kachel auf der Startseite. Details in 0.4.1 bis 0.4.3.

- Abnahme gegen den Produktionscontainer mit zwei erfundenen Familien: `abnahme-0.5` 7 von 7 grün, `abnahme-0.4` 8 von 8, `abnahme-0.3` 7 von 7 und `abnahme-0.2` 7 von 7 weiter grün; Vitest 467 von 467, Lint und Typecheck sauber, CI grün.
- Einschränkungen: Für den FES-Abfallkalender ist keine dokumentierte Schnittstelle bekannt, die Termine kommen nur aus einer selbst eingetragenen ICS-Datei oder Abo-Adresse. Prospekte sind nur Links und starten auf der Startseite des Händlers. Weitere Kalender- und Benachrichtigungsintegrationen (OAuth, ICS-Export, E-Mail- und Push-Erinnerungen) sind nicht gebaut, siehe `docs/module.md`.

## 0.4.3 (13.11.2026)

- Schema note: the waste calendar foreign key stays SQL only (a Prisma relation over the family primary key breaks `family.create()`); generated migrations must not drop it.
- Abfallkalender: the hint no longer promises an FES calendar file; it says what to do if the FES or its app offers one.

## 0.4.2 (13.11.2026)

- Release 0.5 acceptance spec `tests-e2e/abnahme-0.5.spec.ts` (part of `test:abnahme`, against the container, no sign-up, 375 px): modules start off and members cannot switch them; Prospekte and Abfallkalender are switched independently and are gone (404) while off; flyer links are maintained by the owner and hidden ones stay hidden for members; pickups from an uploaded ICS file show on the page and in the start page tile; a subscription that cannot be resolved shows a notice while start page, calendar, shopping, tasks and meals keep working; the other family sees nothing.
- Module page: description and switch stack on phones.

## 0.4.1 (13.11.2026)

Release 0.5, block 1: optional modules.

- Module switches per family (`/familie/module`, sub tab "Module" in the Familie area): Prospekte and Abfallkalender, off by default, switched independently by owners and admins (also enforced by a DB trigger on `family`). A switched-off module answers NotFound on its pages and actions; tile and links disappear. Migration `optional_modules` (appended): columns on `family`, composite foreign key `(wasteCalendarId, id)` to `external_calendar` with `ON DELETE SET NULL`.
- Prospekte (`/einkauf/prospekte`): links to the retailers' own flyer pages, starting with Aldi Süd, Lidl, Edeka, Rewe and Netto; admins edit, hide, remove and add (https only, at most 20). Nothing is fetched, embedded or stored from the retailers.
- Abfallkalender (`/kalender/abfall`, tile "Abfuhr" on the start page for the next 7 days): an admin picks one of the family's external calendars (ICS file or subscription); no documented FES interface exists, so this is the adapter. Shows the stored events only and a notice when the last fetch failed. Link to the FES website.
- Documented in `docs/module.md` (research, decisions, what is not built: OAuth calendars, ICS export, e-mail and push reminders). Tests: `modules.test.ts` (switches, roles, trigger, foreign family, flyers, waste, dashboard).

## 0.4.0 (13.11.2026)

Release 0.4 "Freizeit und persönliche Übersicht": Wunschzettel mit Reservierung und Überraschungsschutz, OpenStreetMap-Karte mit Kategorien und Symbolen, Orte und befristete Veranstaltungen mit Archiv, Filter nach Kategorie, Ersteller und Name, Achtsamkeit mit Sichtbarkeit je Eintrag. Details in 0.3.2 bis 0.3.9.

- Abnahme gegen den Produktionscontainer mit zwei erfundenen Familien: `abnahme-0.4` 8 von 8 grün, `abnahme-0.3` 7 von 7 und `abnahme-0.2` 7 von 7 weiter grün; Vitest 456 von 456, Lint und Typecheck sauber, CI grün. Kartenkacheln kommen vom eingestellten Kachelserver (Vorgabe OpenStreetMap), in der Abnahme abgefangen.

## 0.3.9 (13.11.2026)

- Release 0.4 acceptance spec `tests-e2e/abnahme-0.4.spec.ts` (part of `test:abnahme`, against the container, no sign-up, 375 px): two members share a place and a dated event and filter by category and creator; a wish reserved by Ben stays invisible to Anna; Anna's private mindfulness entry is invisible to Ben, Clara and the other family, the family entry is visible to both members, the entry shared with Ben only to Ben.

## 0.3.8 (13.11.2026)

- Achtsamkeit: deleting an entry needs a second click ("Löschen …", then "Endgültig löschen"); the emoji rating shows a focus ring for keyboard use.

## 0.3.7 (13.11.2026)

Release 0.4, block 3: mindfulness, interface.

- Achtsamkeit (`/achtsamkeit`, sub tab next to Mitglieder in the Familie area; the bottom bar keeps 7 tabs): rate a topic 1–5 with emoji buttons, date, note and visibility (only me, selected members with a picker, whole family; health at most selected). Week grid (topic × day), month averages per topic, history per person, filter by topic. Only own entries can be deleted. The page is left out of feedback screenshots; addresses carry fixed codes only. Documented in `docs/achtsamkeit.md`; E2E `achtsamkeit.spec.ts` (two users, no sign-up, 375 px): the other member sees family and shared entries, never the private one.

## 0.3.6 (13.11.2026)

Release 0.4, block 3: mindfulness, data layer.

- New tables `mindfulness_entry` and `mindfulness_share` (migrations `mindfulness`, `mindfulness_rls`, appended). Ratings 1–5 per profile, local day and topic (Essen, Schlaf, Stimmung, Arbeit, Freizeit, Gesundheit) with optional note and a visibility per entry: only me (author), selected members, whole family. RLS has its own policies per command, not only the family scope: owners and admins see nothing extra; only the author changes or deletes; entries only for the own profile or a child profile without login; health entries can never be visible to the whole family (DB check). Author and viewers are tied to their membership, so leaving the family removes the author's entries and the viewer's shares. Service `mindfulness.ts`; invisible and unknown ids give the same NotFound, no counts of hidden entries. Tests: `mindfulness.test.ts` (service and app role SQL), RLS table list (31 tables).

## 0.3.5 (13.11.2026)

Release 0.4, block 2: map, interface.

- Map (`/karte`, sub tab "Karte" next to Geburtstage and Wunschzettel; the bottom bar keeps 7 tabs): Leaflet map with OpenStreetMap tiles (server via `MAP_TILE_URL`/`MAP_TILE_ATTRIBUTION`, attribution visible), markers with category symbol and colour, filters by category, creator and name, list below the map on phones and beside it on desktop, archive of past events (`/karte?archiv=1`). New point: tap the map (draggable marker) or enter coordinates, plus address text, description, link, image link, rating, note and an optional period. Detail page with edit, move and delete (creator or admin). Category management for admins (`/karte/kategorien`). No geocoding service. Documented in `docs/karte.md` (tile server, privacy, archive); E2E `karte.spec.ts` at 375 px without sign-up, tiles aborted.

## 0.3.4 (13.11.2026)

Release 0.4, block 2: map, data layer.

- New tables `map_category` and `poi` (migrations `map`, `map_rls`, appended): RLS forced, grants, composite foreign key `(categoryId, familyId)`, checks for coordinates, rating 1–5, period and colour. Service `map.ts`: starter categories (Ausflugsziel, Campingplatz, Restaurant, Café, Spielplatz, Veranstaltung, Fest, Flohmarkt) created per family on first use, categories managed by admins with icons from a built-in set only, points shared within the family (creator or admin edits), filters by category, creator and name, temporary points archived (never deleted) after their last day in the family time zone. CSP `img-src` allows the configured tile server (`MAP_TILE_URL`). Dependency `leaflet` 1.9. Tests: `map.test.ts`, RLS table list (29 tables).

## 0.3.3 (13.11.2026)

- Wish lists: the wishing person can no longer lift the surprise protection by editing the list: switching surprise mode off and moving the list to another profile or name are refused on the server (only the creator, or an admin for a child without login, may); the settings form hides both for the wishing person. Tests for all three routes; the schema notes that the birthday foreign key deliberately uses `SET NULL ("birthdayId")`.

## 0.3.2 (13.11.2026)

Release 0.4, block 1: wish lists.

- The sub navigation is labelled "Unterseiten" (a label containing "Geburtstage" matched the "Tag" field in tests).
- Wish lists (`/wuensche`, sub tab "Wunschzettel" next to "Geburtstage"; the bottom bar keeps 7 tabs): one or more lists per family profile or for a person without profile, with description, optional linked birthday and the next occasion (birthday, Christmas, Easter). Wishes with title, description, https-only link, price, priority (Herzenswunsch, Würde mich freuen, Kleinigkeit), occasion, image link (only linked, never embedded) and note; "erhalten" visible to everyone. The birthday page links the lists.
- Visibility "Die ganze Familie" or "Nur ich" (creator only, enforced by RLS). Other members reserve a wish ("Ich schenke das"), release it or mark it as given. Surprise mode (default): the wishing person gets no reservation information; reservations live in their own table, RLS hides and refuses them for the user linked to the list's profile, own reservation attempts get the same refusal either way. Without surprise mode only "Schon reserviert", never by whom. Documented in `docs/wunschzettel.md`.
- New tables `wishlist`, `wish`, `wish_reservation` (migrations `wishlists`, `wishlists_rls`, appended): RLS forced, grants, composite foreign keys `(id, familyId)` incl. a new unique `(id, familyId)` on `birthday`; deleting a birthday only clears the link. Tests: helpers (https, price, Easter, next occasion), service (rights, private lists, birthday link, surprise protection incl. untouched wish row, database-level hiding, conflict, release, given, non-surprise mode, received), foreign family and non-member, RLS table list (27 tables); E2E `wuensche.spec.ts` at 375 px without sign-up.

## 0.3.1 (13.11.2026)

- Customer wish #10: six task priorities (Sofort, Dringend, Zeitnah, Demnächst, Bei Gelegenheit, Irgendwann; default Zeitnah) shown as pastel badges with the name (lila, rot, gelb, grün, blau, türkis) plus a coloured row edge; existing values mapped HIGH→Dringend, NORMAL→Zeitnah, LOW→Bei Gelegenheit (migration `task_priority_dashboard`, appended). New per-task checkbox "Im Kalender auf der Startseite anzeigen" (default off, existing tasks off): only these tasks appear in the dashboard week; the tiles Meine Aufgaben, Heute fällig and Überfällig still list every task. `/aufgaben` sorts open tasks strictly by due date (time, then priority; no date last). `/routinen` has three tabs (`?tab=neu|alle|woche`): Neu with templates, Alle Routinen with edit, Meine 7 Tage to tick off or skip own occurrences.
- Acceptance spec `abnahme-0.2` follows the routine tabs: create via `?tab=neu`, own occurrences in `?tab=woche`, unassigned ones on the routine page.

## 0.3.0 (13.11.2026)

Release 0.3 "Essen und Einkauf": Rezepte (von Hand und per URL-Import), Wochenplan mit Kochzuständigkeit, Kachel "Essen heute", Einkaufsliste mit mehreren Geschäften, Zutaten vollständig oder selektiv übertragen, optionale KI-Rezeptideen, Kontoseite. Details in 0.2.2 bis 0.2.6.

- Abnahme gegen den Produktionscontainer mit zwei erfundenen Familien: `abnahme-0.3` 7 von 7 grün, `abnahme-0.2` weiter 7 von 7 grün; Vitest 399 von 399, Lint und Typecheck sauber, CI grün. Der URL-Import einer echten Seite braucht einen externen https-Abruf; belegt durch die Parser-Tests, in der Abnahme nur die Ablehnung interner Adressen.

## 0.2.6 (13.11.2026)

- Release 0.3 acceptance spec `tests-e2e/abnahme-0.3.spec.ts` against the production container (`npm run test:abnahme`): recipe by hand, internal import address refused, planned for today with a cook, "Essen heute" tile, chosen ingredients to the list with shop and origin, second member sees plan and list, other family sees nothing, 375 px without overflow.

## 0.2.5 (13.11.2026)

Release 0.3, block 3: shopping list.

- Shopping list (`/einkauf`, sub tab "Einkauf" in Essen; tabs now Wochenplan · Rezepte · Einkauf · Idee): entries with quantity, unit, name, note, one or more shops; add, edit, delete, tick off, "Erledigte wegräumen" (hidden, restorable under "Weggeräumt" or deleted for good), filter per shop, open entries grouped by shop in shop order. Shops per family (default Supermarkt, Drogerie, Baumarkt, IKEA; add, rename, reorder, remove, at most 20, the last one stays) under `/einkauf/geschaefte`. "Aktualisieren" button plus a quiet refresh every 30 s while the page is visible.
- Recipe ingredients to the list (`/einkauf/rezept/[id]`, linked from the recipe page and from planned meals): preview with all ingredients ticked, untick to choose, adjust quantity, unit and shop per row, scaled portions are taken over. Names come from the stored recipe. An open entry with the same name and a compatible unit is merged (quantities added, g/kg and ml/l converted) instead of duplicated; the origin "aus Rezept „X“" stays visible and survives deleting the recipe (title snapshot, no foreign key).
- Account page (`/konto`, linked in the sidebar and the mobile header): change password (current password required, 5 attempts per user in 15 minutes, ends all other sessions, rotates the security stamp) and "Überall abmelden" (ends every session including this one).
- Feedback button is hidden while no verified active family is chosen (e.g. on the family picker) instead of failing on submit.
- New tables `shop`, `shopping_item`, `shopping_item_shop` (migrations `shopping_list`, `shopping_list_rls`, appended): RLS forced, `family_scope`, grants incl. DELETE, composite foreign keys `(id, familyId)` for the item-shop link. Tests: merge helpers, service (CRUD, shops, filter, clear/restore, transfer with selection, merge, origin, done entries not merged, recipe deletion), foreign recipe/ingredient/shop/item, non-member, RLS for the three tables (24 tables in total), password change and sign out everywhere; E2E `einkauf.spec.ts` at 375 px (plan recipe, transfer chosen ingredients, merge, second member sees the list, other family does not, feedback hidden on the family picker, password change keeps this session, sign out everywhere) without an extra sign-up.

## 0.2.4 (13.11.2026)

- Meal plan: two concurrent plans of the same empty slot (or the same new slot name) now end as "slot taken" instead of a server error; the unique index decides, covered by a race test.

## 0.2.3 (13.11.2026)

Release 0.3, block 2: meal plan and recipe ideas.

- Meal plan (`/essen`, menu entry "Rezepte" becomes "Essen" with sub tabs Wochenplan · Rezepte · Rezeptidee, so the bottom bar keeps 7 tabs): week Monday to Sunday, meals of the day configurable per family (default Frühstück, Mittag, Abend; add, rename, reorder, remove, at most 8, the last one stays). Each slot holds a recipe or a free text and one or more cooks (profiles of the family). Edit moves a meal to another day or slot (refused if taken). "Woche in die nächste kopieren" copies meals and cooks and never overwrites planned slots. Deleting a planned recipe keeps the meal as free text.
- Dashboard tile "Essen heute" replaces "kommt bald": today's meals in slot order, who cooks, link to the recipe. The recipe image is only linked ("Bild ansehen"): the CSP stays `img-src 'self'`, nothing foreign is loaded or mirrored.
- Recipe ideas (`/essen/idee`) through an optional provider: interface plus Anthropic adapter (Messages API over plain fetch, model from `AI_MODEL`, default `claude-sonnet-5-5`). Active only when `AI_PROVIDER=anthropic` and `ANTHROPIC_API_KEY` are set, otherwise the page says "nicht eingerichtet". Only the wish fields (keywords, exclusions, diet, time, servings) are sent, no names, family data or user ids. 20 ideas per family and hour (failed calls count), members only, checked before the provider is called. The answer is validated like a recipe, links are dropped, and it lands as an unsaved draft in the recipe form with an allergen "no guarantee, check cross-contamination" note. Fixed German error messages, never the provider's text.
- New tables `meal_slot`, `meal`, `meal_cook` (migrations `meal_plan`, `meal_plan_rls`, appended): RLS forced, `family_scope`, composite foreign keys `(id, familyId)` to slot, recipe and profile, check "recipe or text". Tests: service (plan, move, conflicts, foreign recipe/profile/slot/meal, non-member, copy semantics, recipe deletion, slots), RLS for the three tables (21 tables in total), AI with a mocked provider and a stubbed fetch (only wishes sent, headers, default and configured model, disabled cases, per-family limit, errors), E2E at 375 px in the recipe spec (no additional sign-up).

## 0.2.2 (13.11.2026)

Release 0.3, block 1: recipes.

- Recipes (`/rezepte`, new menu entry "Rezepte"): create, edit, delete with title, servings, time, description, ingredients as rows (quantity, unit, name), steps, tags, allergen notes (shown with a "no guarantee" hint), image link and source link (https only, shown as links; nothing foreign is loaded or mirrored, the CSP stays `img-src 'self'`). List with search by title or tag. Portions are scaled on the recipe page (`?portionen=N`), quantities shown as ½ ¼ ¾ ⅓ ⅔ where they fit. No image upload yet.
- Import by URL: the server fetches the page through the existing SSRF guard (now generic: `fetchPublicText`/`parsePublicUrl`, https only, port 443, every resolved address public, redirects checked, 10 s, 2 MB) and reads schema.org/Recipe from JSON-LD (`@graph`, type arrays, HowToStep/HowToSection, string steps) or Microdata. The result is only a draft in the form; nothing is saved until the person checks and saves it. The source stays linked. Only family members can trigger a fetch, 10 imports per user in 10 minutes; refused addresses do not count. Ingredient lines are split into quantity/unit/name (fractions, ½, ranges, decimal comma, German units).
- New tables `recipe` and `recipe_ingredient` (migrations `recipes`, `recipes_rls`, appended): RLS forced, `family_scope` policy, ingredients reference `(recipeId, familyId)` so a row can never point at another family's recipe. Tests: parser with invented sample pages (JSON-LD, Microdata, caps, hostile input), SSRF cases for the import, foreign access by id, RLS for both tables, E2E at 375 px (create, scale, edit, delete, a recipe of another family gives 404, internal address refused; one sign-up only, the full E2E run is close to the sign-up limit per address).

## 0.2.1 (13.11.2026)

Sicherheitsrelease vor der Vorstellung von 0.2: Befunde #7 und #8 behoben, Versionsanzeige.

- Security (#8): Every failed login counts on the account counter again, also from a known device; known devices are only exempt from the account delay (and still braked on their own counter). At most 5 known devices per account are exempt at a time (in memory, 30 days, keyed by the security stamp, so after a rotation old devices neither stay known nor count; also forgotten explicitly on rotation). Device cookie is now `<id>.<iat>.<mac>`, the MAC covers e-mail, a per-user security stamp, id and iat; the server refuses cookies older than 90 days, and re-issuing after a login keeps the original iat, so the lifetime is not extended. New column `user.securityStamp` (migration `user_security_stamp`, appended): a trigger rotates it on every password change or reset, a Better Auth hook on "sign out everywhere" (`/revoke-sessions`). Tests: a reset and "sign out everywhere" invalidate old device cookies, many device cookies do not bypass the account counter, device cap, 90-day expiry, iat kept.
- Version shown small at the bottom of every page ("Plan4JU 0.2.1"), also on `/anmelden` without signing in, and in the side menu.

- Security (#7): ICS parsing has one step budget for the whole file (100 000 steps over all recurring events), stops every series once 5000 instances are stored, reads at most 10 000 VEVENTs, ends after 3 s, and does not expand FREQ=SECONDLY/MINUTELY/HOURLY (first instance only, flagged as truncated). SSRF check allows IPv6 only from global unicast 2000::/3 after the mapped/NAT64/6to4 checks (64:ff9b:1::/48 stays blocked). Time zone formatter cache keyed by the canonical zone, invalid names not cached, bounded to 500 entries. Calendar limit per family enforced with `pg_advisory_xact_lock` so parallel imports cannot exceed it. Tests for each.

## 0.2.0 (13.11.2026)

Release 0.2 "Familienorganisation": Aufgaben mit mehreren oder keinen Zuständigen, Routinen (fest, reihum oder je Termin einzeln zugeordnet), Geburtstage, gemeinsamer Kalender mit ICS-Import und Abonnement, Dashboard mit "Als Nächstes", "Heute zu Hause" und Woche. Details in 0.1.3 bis 0.1.7.

- Abnahme gegen den Produktionscontainer mit zwei erfundenen Familien (`npm run test:abnahme`, 7 von 7 grün) und die übrigen E2E-Dateien einzeln gegen denselben Container (26 von 26 grün).
- Feedback-Knopf aus der Testphase (bisher "Unreleased"):

- Feedback in der Testphase: schwebender Knopf „Feedback“ (Sprechblase, mobil über der Tab-Leiste) auf jeder Seite für angemeldete Nutzer, Menüeintrag „Feedback geben“ und eine Kachel auf dem Dashboard. Formular mit Art (Fehler/Idee/Sonstiges), Text (max. 5000 Zeichen), optional Name, optional Aufnahme der aktuellen Seite (html2canvas-pro, nur auf Klick) oder eigenes PNG/JPEG bis 5 MB (Typ per Magic Bytes geprüft). Mitgeschickt: Seitenpfad ohne Query, App-Version, Browser/Gerät grob, Bildschirmbreite.
- Neue Tabelle `feedback` (Migration `feedback`, nach den Routinen-Migrationen, RLS wie alle Familientabellen, Autor muss der angemeldete Nutzer sein); jede Meldung wird zuerst gespeichert und dann als reiner Text mit Bild im Anhang an `FEEDBACK_MAIL_TO` gemailt (Reply-To = Absender). Ohne Empfänger oder bei Versandfehler bleibt sie gespeichert, das Log enthält keinen Inhalt. Limit 10 Meldungen je Konto und Stunde. Server-Actions nehmen bis 6 MB an.

### 0.1.7

- Release 0.2 acceptance as its own Playwright spec (`tests-e2e/abnahme-0.2.spec.ts`, `npm run test:abnahme`, config `playwright.abnahme.config.ts` without a web server, base URL from `E2E_BASE_URL`): runs against the production container (`docker compose --profile app`) with two invented families. Covers a task with two assignees and one with none, a routine with a fixed assignee, a routine assigned per occurrence (today Anna, tomorrow Ben, the rest nobody), an event and a birthday in the week overview for both members, ICS file import shown as external, the other family seeing none of it, and nine pages at 375 px without horizontal overflow, with screenshots (`ABNAHME_DIR`). The default E2E run skips it, because together the specs would exceed the sign-up limit per address (10 in 15 minutes).

### 0.1.6

Release 0.2, block 3: dashboard and login brake.

- Dashboard after the design reference (`docs/design/vorbild-dashboard.jpg`): card "Als Nächstes" (next timed event or open routine today with person, time, place and "in N Minuten", plus "Danach" with up to three more), "Heute zu Hause" (one row per person on a 6-22 h strip with the line for now; events and routines, all-day events listed above, entries nobody is assigned to in an extra row "Alle"), "Diese Woche" now marks events with the colours of their participants. Wide screens: main column and a side column with the tiles Essen, Schule, Sterne (still "kommt bald"); phones stack everything. Logic is pure and tested (`src/lib/today-agenda.ts`): routines count as 30 minutes, an event without end as one hour, multi-day events fill the day, times are family-zone wall clock.
- Login brake (issue 5): after a successful login the browser gets a signed, HttpOnly cookie with a random device id bound to the account (`src/server/device-cookie.ts`, HMAC from `BETTER_AUTH_SECRET`, 400 days). A known device is braked by its own failure counter and its own window; strangers (no or invalid cookie) keep sharing the account counter. A flood on the account therefore no longer slows the owner's known device, and the owner's successful login no longer resets the stranger's brake. The hard limit per e-mail and address and the per-address limit are unchanged. The cookie is not a credential. Tests: 50 parallel attempts, own counters, cookie bound to the account, forgeries refused; E2E: login sets the cookie.
- E2E (`tests-e2e/heute.spec.ts`): event for one member and routine for another show up in the strip and the week for both members, the other family sees nothing, three "kommt bald" tiles remain, 375 px stacked without overflow.

### 0.1.5

- SSRF check also blocks Teredo (2001::/32, embeds an obfuscated IPv4 address) and local-use NAT64 (64:ff9b:1::/48); tests added.

### 0.1.4

Release 0.2, block 2: calendar. Details and decisions in `docs/kalender.md`.

- Calendar plumbing: `src/lib/tz.ts` (wall clock to UTC and back with Intl, DST gap and overlap handled), `src/server/safe-fetch.ts` (SSRF-safe retrieval of calendar subscription URLs: https and port 443 only, no user info, every resolved address must be public, connection pinned to the validated address, redirects followed by hand and re-checked, 10 s deadline, 5 MB limit, errors carry a fixed code and never the address), `src/server/calendar-crypto.ts` (AES-256-GCM, key derived from `BETTER_AUTH_SECRET` with HKDF; rotating that secret means subscription URLs must be entered again), `src/server/ics.ts` (iCalendar parsing and bounded expansion, -31 to +366 days, max 5000 instances).
- New dependency `ical.js` (server only, no further dependencies): real calendar feeds use RRULE with BYDAY/BYSETPOS, EXDATE and RECURRENCE-ID overrides, which are too error-prone to parse by hand.
- Tests: SSRF cases (loopback, private, link local, metadata address, IPv4-mapped IPv6, redirects to http or to blocked hosts, DNS answers with one private address, size and time limits), ICS cases (TZID without VTIMEZONE, own VTIMEZONE, floating, all-day with exclusive end, EXDATE, overridden instance, DST), encryption round trip, other-row and tamper refusal.
- Calendar data: tables `calendar_event`, `calendar_event_participant`, `external_calendar`, `external_calendar_event` (migrations `calendar` and `calendar_rls`: `familyId`, forced RLS, grants for the app role, composite foreign keys `(id, familyId)` so references cannot cross families, check constraint for the time shape). Timed events are stored as UTC instants, all-day events as local days (last day inclusive, an all-day `DTEND` in a file is exclusive and converted). Internal events repeat like routines; a repeated event keeps its wall clock time across daylight saving changes.
- Services (`services/calendar.ts`): create / edit / delete events with participant profiles, `itemsBetween` (internal events expanded on read, enabled external calendars, multi-day events on every day they touch), ICS file import and re-import, subscriptions, enable / disable, delete. Imported files and subscriptions are read only. External events are expanded into a bounded window (31 days back to 366 days ahead, at most 5000 instances) when imported or fetched; duplicates inside one calendar collapse by uid and start. Limits: 10 calendars per family, files up to 2 MB.
- Subscription addresses are secrets: stored encrypted only, never selected for the UI, never returned, never logged; changing one means deleting the calendar and subscribing again. A stored address that can no longer be decrypted (rotated `BETTER_AUTH_SECRET`) gets its own error text. Fetch: claim in one transaction (sets `lastAttemptAt`, so parallel page loads fetch once), download with no transaction open, replace events in a second one. Refresh: manual at most once a minute per calendar, lazy (after the response is sent, on the start page and the calendar) when the data is older than an hour. On failure the old events stay and a fixed error code is stored.
- Dashboard: `getDashboard` and `buildDashboard` carry internal and external events in the week (`week[].events`, `eventsToday`).
- Tests: RLS for the four tables (list, by id, change, insert for another family, composite keys, time shape), service tests (events, DST, all-day, import, subscription with injected resolver and transport, secrecy of the address, parallel fetch, failure codes, address refusal, limit), pure calendar item tests including `buildDashboard`.
- UI: `/kalender` (week and month view with events, birthdays, routines and tasks with a due date; month grid with dots, tap a day for its entries), `/kalender/termin/neu`, `/kalender/termin/[id]` (delete only after a confirmation step), `/kalender/quellen` (ICS file import and re-import, subscription by address, enable / disable, rename, colour, last successful fetch and a readable error, delete with confirmation). External events are marked "Extern" with the calendar name and colour and cannot be edited. Dashboard: events in the week cards and a tile "Termine heute". New nav entry (six tabs).  Calendar descriptions are rendered as plain text.
- Tests: E2E for create / edit / delete, week and month view, dashboard, file import and hiding, refused subscription addresses (the address never appears in the URL or page), isolation between families, 375 px without overflow with six tabs.
- Docs: `docs/kalender.md` (what is built, decisions, what is not), `SECURITY.md` notes on subscriptions and key derivation.
- Not built: Google / Apple OAuth, exceptions for single occurrences of an own series, background polling (subscriptions refresh when the calendar is opened), merging equal events across calendars.

### 0.1.3

Release 0.2, block 1: tasks completed, routines.

- Tasks: description, priority (low/normal/high), optional time, status open / in progress / done, archive (leaves lists and dashboard, can be restored), edit page, delete only after an explicit confirmation. Filters: all, mine, unassigned, done, archive, plus person and due-date range. Migration `tasks_routines` (new columns, enum value `IN_PROGRESS`).
- Routines: tables `routine`, `routine_assignment`, `routine_occurrence`, `routine_occurrence_assignment` (migration `routines_rls`: `familyId`, forced RLS, grants for the app role). Recurrence daily / weekly on chosen weekdays / monthly (short months use their last day), every n-th, start and optional end date, optional time. Assignment fixed (one or several persons), rotating, or per occurrence; any occurrence can be reassigned by hand.
- Occurrences are created for a bounded window: from today (family time zone) up to 56 days ahead, topped up lazily below 28 days; never into the past. Done / skipped / hand-assigned / past occurrences are never changed by editing, pausing or archiving a routine, only untouched open future ones are rebuilt.
- Templates "Ins Bett bringen", "Abendessen kochen", "Kita bringen", "Kita holen" prefill the new-routine form.
- UI: `/routinen` (next 14 days, tick off, skip, reassign, pause, archive), `/routinen/neu`, `/routinen/[id]`; dashboard shows routines in the week and a tile "Routinen heute" with direct tick-off; new nav entry.
- Tests: recurrence unit tests incl. DST (29.03. and 25.10.2026) and `todayIn` at local midnight, routine and task integration tests, RLS tests for the four new tables, E2E for filter/edit/delete and routines with individual assignment.

### 0.1.2
- `create-family`: `--family <id>` stellt eine neue Owner-Einladung für eine bestehende Familie aus; `--send` verweigert Links auf localhost (ohne `--allow-localhost`).

### 0.1.1

Security fixes before the 0.1 release (issues #3 and #4).

- Database: new migration `membership_owner_guard`. `app_family_role()` (SECURITY DEFINER, fixed `search_path`); membership INSERT/UPDATE/DELETE policies allow OWNER rows (old and new) only for owners, admins write only MEMBER rows, matching `permissions.ts`. A trigger keeps the last owner of a family (no removal, no demotion; deleting the whole family still works).
- Client address for rate limits only from trusted proxy hops: `TRUSTED_PROXY_HOPS` (default 1) picks the X-Forwarded-For entry from the right, `X-Real-IP` only with `TRUSTED_REAL_IP=true`; without a trusted address one shared bucket applies (also in Better Auth). Better Auth reads the same address (`advanced.ipAddress`) through an internal header that the `/api/auth` route always overwrites.
- Login limiter per e-mail counts only failed attempts, keyed by e-mail and client address, and is reset after a successful login; a second per-account counter (from 20 failures / 15 min) slows every attempt down (1 s doubling to 10 s) instead of locking the account; separate key namespaces, e-mail normalized and validated. Above that threshold only one attempt per delay window: the window is reserved before sleeping, parallel or early attempts are refused at once without a credential check (`login-guard.ts`). `/sign-in/email` keeps its strict HTTP limit.
- `safeNext` parses with `new URL`, requires the same origin and rejects control characters, whitespace, backslashes and encoded tabs/slashes; used by the login page and the login action.
- Tests: RLS owner rules and last owner, `safeNext`, client address, login failure limiter, spoofed X-Forwarded-For on the HTTP limit.

### 0.1.0

- Dockerfile (multi-stage, non-root runtime user, `runner` and `migrate` targets), `.dockerignore`, compose profile `app` (migrations run once before the app starts, app bound to localhost, read-only filesystem, all capabilities dropped).
- GitHub Actions CI: ESLint, typecheck, Vitest and Playwright against PostgreSQL, Docker build, gitleaks.
- README: local, Docker, update, backup/restore, reverse proxy with HTTPS. `SECURITY.md`, `LICENSE` (MIT).
- Optional analytics snippet via `ANALYTICS_SCRIPT_URL` / `ANALYTICS_SITE` (runtime env, off by default); the CSP moved to `src/proxy.ts` so it can allow that origin at runtime.
- CI passes the Mailpit port to the tests.
- Mailpit image pinned; an empty `MAIL_FROM` falls back to the default sender.

- Docs: `docs/konzept.md` – Gesamtkonzept (Stand 13.11.2026), mit den entschiedenen Infrastrukturpunkten.

### 0.0.9

- Tasks (optional due date, none/one/several assignees, tick off, delete) and birthdays (create, edit, delete, next upcoming) with German pages.
- Dashboard: clock, date and greeting in the family time zone, "Diese Woche" Monday to Sunday with tasks and birthdays (today highlighted), tiles for own / due today / overdue tasks and next birthdays, later modules as "kommt bald". One fixed colour per person.
- App shell mobile first (bottom tab bar, sidebar on desktop), logo and icons, PWA manifest, minimal service worker that caches nothing.
- Security headers and CSP (`next.config.mjs`).
- Playwright E2E (`npm run test:e2e`): two accounts of one family see task and birthday, an account of another family does not, no horizontal overflow at 375 px, manifest and headers. Vitest: week helpers and dashboard shaping.

### 0.0.8

- Password reset revokes all open sessions of the account (test asserts it).

### 0.0.7

- Authentication with Better Auth: e-mail + password (Argon2id), required e-mail verification via SMTP from env (Mailpit locally), password reset, rate limits for login/reset/sign-up (HTTP and server actions).
- Registration by invitation only: single-use tokens (hash stored, 7 days, revocable); SECURITY DEFINER functions for lookup/accept; sign-up outside the invitation flow creates no account.
- Instance admin CLI `admin:create-family` (family + owner invitation); owner policies for forced RLS.
- Roles Owner/Admin/Member with server-side checks, child profiles without login, several families per account with a signed, user-bound active-family cookie.
- German pages: sign in, accept invitation, choose family, members and invitations, password reset. Tailwind added.
- Tests for the invitation flow, rights, Mailpit mails and rate limits (65 tests in total).

### 0.0.6

- Security: membership insert/update/delete now require OWNER or ADMIN of the active family (a plain member could raise their own role). Tests added.

### 0.0.5

- Docker Compose for development: PostgreSQL 16 (volume, healthcheck) and Mailpit, localhost only; `.env.example` extended.
- First Prisma migration plus a row level security migration: forced RLS on all family-scoped tables, restricted app role `plan4ju_app` (no BYPASSRLS), context via `set_config(..., true)` per transaction; `directUrl` for migrations as owner.
- Service layer with membership check (`withFamily`, `withUser`), tasks and birthdays services, Zod validation.
- Vitest integration tests against the real database: family isolation incl. direct ids, no context sticking across transactions, rollbacks and concurrent requests. ESLint flat config.


- App-Logo (Haus mit Haken, terrakotta) und Icons: `assets/logo.svg`, `icon-512.png`, `icon-192.png`, `apple-touch-icon.png` (180 px). Maskable-tauglich (Motiv im inneren 80 %-Kreis), bei 32 px lesbar.
