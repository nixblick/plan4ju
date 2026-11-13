# Changelog

## Unreleased

- Customer wish #10: six task priorities (Sofort, Dringend, Zeitnah, Demnächst, Bei Gelegenheit, Irgendwann; default Zeitnah) shown as pastel badges with the name (lila, rot, gelb, grün, blau, türkis) plus a coloured row edge; existing values mapped HIGH→Dringend, NORMAL→Zeitnah, LOW→Bei Gelegenheit (migration `task_priority_dashboard`, appended). New per-task checkbox "Im Kalender auf der Startseite anzeigen" (default off, existing tasks off): only these tasks appear in the dashboard week; the tiles Meine Aufgaben, Heute fällig and Überfällig still list every task. `/aufgaben` sorts open tasks strictly by due date (time, then priority; no date last). `/routinen` has three tabs (`?tab=neu|alle|woche`): Neu with templates, Alle Routinen with edit, Meine 7 Tage to tick off or skip own occurrences.
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
