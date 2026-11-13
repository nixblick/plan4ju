# Changelog

## Unreleased

- Docs: `docs/konzept.md` – Gesamtkonzept (Stand 13.11.2026), mit den entschiedenen Infrastrukturpunkten.

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
