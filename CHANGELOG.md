# Changelog

## Unreleased

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
