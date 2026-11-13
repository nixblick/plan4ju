# Changelog

## Unreleased

- Docs: `docs/konzept.md` – Gesamtkonzept (Stand 13.11.2026), mit den entschiedenen Infrastrukturpunkten.

### 0.0.6

- Security: membership insert/update/delete now require OWNER or ADMIN of the active family (a plain member could raise their own role). Tests added.

### 0.0.5

- Docker Compose for development: PostgreSQL 16 (volume, healthcheck) and Mailpit, localhost only; `.env.example` extended.
- First Prisma migration plus a row level security migration: forced RLS on all family-scoped tables, restricted app role `plan4ju_app` (no BYPASSRLS), context via `set_config(..., true)` per transaction; `directUrl` for migrations as owner.
- Service layer with membership check (`withFamily`, `withUser`), tasks and birthdays services, Zod validation.
- Vitest integration tests against the real database: family isolation incl. direct ids, no context sticking across transactions, rollbacks and concurrent requests. ESLint flat config.


- App-Logo (Haus mit Haken, terrakotta) und Icons: `assets/logo.svg`, `icon-512.png`, `icon-192.png`, `apple-touch-icon.png` (180 px). Maskable-tauglich (Motiv im inneren 80 %-Kreis), bei 32 px lesbar.
