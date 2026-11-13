# Plan4JU

Familienplanungs-App (Aufgaben, Routinen, Termine, Mahlzeiten, Einkäufe, Wünsche).
Der Auftrag steht in [docs/masterprompt.md](docs/masterprompt.md).

## Entwicklung

```
cp .env.example .env        # every CHANGE_ME replaced (local only, .env is gitignored)
docker compose up -d        # PostgreSQL 16 and Mailpit
npm ci
npm run db:migrate          # as table owner (DATABASE_ADMIN_URL)
npm run db:generate
npm test                    # integration tests against the real database
```

Mailpit (web UI and SMTP) listens on localhost only; ports are set in `.env`.

## Mandantentrennung

Every family-scoped table has `familyId` and PostgreSQL row level security (forced).
The app connects as role `plan4ju_app` (no BYPASSRLS, owns nothing); migrations run as the
table owner. Each request runs in one transaction via `withFamily()` in `src/server/tenant.ts`,
which sets the context with `set_config(..., true)` (= `SET LOCAL`), checks the membership and
discards the context at commit. Services in `src/server/services/` additionally filter by
`familyId`. A new table needs grants and policies in its own migration; `tests/rls.test.ts`
lists the protected tables. Creating families is an administrative task (owner connection).

## Geheimnisse

Datenbank- und Auth-Zugänge: `.env` lokal, Vorlage `.env.example`, Vault `~/.secrets/plan4ju/`.
