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

## Anmeldung, Einladung, Rollen

- Better Auth mit E-Mail und Passwort (Argon2id), E-Mail-Bestätigung Pflicht, Passwort-Reset per Mail.
  Mails gehen über `SMTP_URL` / `MAIL_FROM`; lokal fängt Mailpit sie ab (Weboberfläche am Port `MAILPIT_UI_PORT`).
- **Keine Selbstregistrierung.** Konten entstehen nur über eine Einladung (Token 256 Bit, nur der Hash wird gespeichert,
  7 Tage gültig, einmal verwendbar, widerrufbar). Ein direkter Aufruf von `/api/auth/sign-up/email` legt nichts an.
- Neue Familie und ersten Owner legt der Instanz-Administrator an:
  `npm run admin:create-family -- --name "Familie Muster" --owner owner@example.test [--send]`
  (nutzt `DATABASE_ADMIN_URL`, gibt den Einladungslink einmal aus). Für Produktion einen Owner ohne Superuser-Recht verwenden;
  die Migration legt für die Owner-Rolle eigene Policies an, damit FORCE RLS sie nicht aussperrt.
- Rollen: Owner (alles, Rollen ändern), Admin (Mitglieder einladen und entfernen, Kinderprofile), Mitglied.
  Kinderprofile haben keinen Login. Jede Aktion wird serverseitig geprüft (`src/server/permissions.ts`), zusätzlich RLS.
- Mehrere Familien je Konto: nach der Anmeldung wählt man die aktive Familie (Seite „Familie wählen“). Das Cookie ist an
  den Nutzer gebunden und signiert; Mitgliedschaft und Rolle werden bei jedem Request aus der Datenbank gelesen.
- Rate Limits: Better Auth begrenzt die HTTP-Routen, die Formulare haben ein eigenes Limit. Beide halten ihren Zähler im
  Arbeitsspeicher (eine Instanz); hinter dem Reverse Proxy zusätzlich begrenzen.

## Geheimnisse

Datenbank- und Auth-Zugänge: `.env` lokal, Vorlage `.env.example`, Vault `~/.secrets/plan4ju/`.
