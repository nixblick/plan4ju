# Plan4JU

Familienplanungs-App (Aufgaben, Routinen, Termine, Mahlzeiten, Einkäufe, Wünsche).
Der Auftrag steht in [docs/masterprompt.md](docs/masterprompt.md).

## Entwicklung (lokal)

```
cp .env.example .env        # every CHANGE_ME replaced (local only, .env is gitignored)
npm ci
npm run db:up               # PostgreSQL 16 and Mailpit (docker compose, localhost only)
npm run db:migrate          # as table owner (DATABASE_ADMIN_URL)
npm run db:generate
npm run dev                 # http://localhost:3000
npm run lint && npm run typecheck && npm test
```

Mailpit (web UI and SMTP) listens on localhost only; ports are set in `.env`.
Use random, URL-safe values (letters and digits) for the database passwords, e.g. `openssl rand -hex 16`;
`BETTER_AUTH_SECRET` is `openssl rand -hex 32`.

## Docker (Betrieb)

The image is built from `Dockerfile` (multi-stage, Node 22, runs as the unprivileged user `node`). The compose
profile `app` adds three things: `migrate` (applies the migrations, then exits), `app` (waits for `migrate`) and the
database. The app is published on `127.0.0.1:${APP_PORT:-3000}` only; a reverse proxy makes it reachable.

```
cp .env.example .env
# edit .env: real passwords, BETTER_AUTH_SECRET, BETTER_AUTH_URL=https://plan.example.org,
# SMTP_URL=smtps://user:pass@mail.example.org:465 (URL-encode special characters), MAIL_FROM
docker compose --profile app up -d --build --wait app
docker compose --profile app run --rm migrate npx tsx scripts/create-family.ts \
  --name "Familie Muster" --owner owner@example.org --send
```

The second command creates the first family and mails the owner an invitation link (without `--send` the link is
printed once). Registration is possible only through invitations.

Update to a new version:

```
git pull
docker compose --profile app up -d --build --wait app    # rebuilds, runs migrations, restarts the app
```

Backup and restore (database dump, custom format):

```
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > plan4ju-$(date +%F).dump

docker compose --profile app stop app
docker compose exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner --single-transaction' < plan4ju-2026-01-01.dump
docker compose --profile app start app
```

Keep dumps off the server and encrypted; they contain all family data. Test the restore on a spare machine before
you need it. The compose database owner is a PostgreSQL superuser (image default); for a hardened setup connect an
external database with a non-superuser owner role and a separate `plan4ju_app` role (`NOBYPASSRLS`, see
`docker/postgres-init/01-app-role.sh`).

### Reverse proxy with HTTPS

Run any TLS-terminating proxy (Caddy, nginx, Traefik) on the host and forward to `127.0.0.1:3000`. Requirements:
HTTPS only (redirect port 80), forward `Host`, `X-Forwarded-For` and `X-Forwarded-Proto`, and set
`BETTER_AUTH_URL` to the public https URL. The request body limit of the proxy must be at least 3 MB (calendar file import
up to 2 MB; many proxies default to 1 MB). The app fetches calendar subscription addresses itself (https only, public
addresses only), so it needs outbound HTTPS.

`TRUSTED_PROXY_HOPS` (default `1`) is the number of proxies in front of the app that append to `X-Forwarded-For`.
The client address for rate limits is the entry that many places from the right; everything left of it can be set
by the client and is ignored. `X-Real-IP` is used only with `TRUSTED_REAL_IP=true` (set it only if the proxy
always overwrites that header). Without a trusted address all such requests share one rate-limit bucket. One proxy on the same host: `1`;
a CDN or load balancer in front of that proxy: `2`; no proxy at all: `0` (forwarded headers are ignored).

Minimal Caddy example:

```
plan.example.org {
    reverse_proxy 127.0.0.1:3000
}
```

Minimal nginx location (certificates e.g. from certbot):

```
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

The in-app rate limits count per process; add request limits at the proxy for the sign-in and password routes.
Do not forward client-supplied `X-Forwarded-For` unchanged (set it as above).

### Optional analytics

If `ANALYTICS_SCRIPT_URL` is set (full URL of a tracker script), the page includes
`<script defer src="$ANALYTICS_SCRIPT_URL" data-site="$ANALYTICS_SITE">` and the Content Security Policy allows that
origin. Without the variable nothing is emitted and no third-party origin is allowed. Read at runtime, no rebuild needed.

## Continuous integration

`.github/workflows/ci.yml` runs on every push and pull request: ESLint, typecheck, Vitest and Playwright against a
throwaway PostgreSQL (random passwords per run), Docker build of both targets (and a check that the image does not
run as root) and gitleaks.

## Oberfläche und E2E

Dashboard (`/`), Kalender (`/kalender`), Aufgaben (`/aufgaben`), Routinen (`/routinen`), Geburtstage (`/geburtstage`); mobil zuerst mit Tab-Leiste, ab `md` Seitenleiste.
PWA: `manifest.webmanifest`, Icons aus `public/`; der Service Worker (`public/sw.js`) cached bewusst nichts.
Security-Header und CSP stehen in `next.config.mjs` (`script-src` braucht `'unsafe-inline'` wegen der Next-Bootstrap-Skripte).

E2E (Playwright, braucht laufende DB aus `npm run db:up` und einmal `npx playwright install chromium-headless-shell`):
`npm run test:e2e` baut die App, startet sie auf Port 3000 (`E2E_PORT` ändert das) und legt seine Testfamilien selbst an und wieder weg.

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
  `npm run admin:create-family -- --name "Familie Muster" --owner owner@example.test [--send]`, neue Einladung für eine bestehende Familie mit `--family <id>` statt `--name`. Für `--send` muss `BETTER_AUTH_URL` die öffentliche Adresse sein, lokal mit `--allow-localhost`.
  (nutzt `DATABASE_ADMIN_URL`, gibt den Einladungslink einmal aus). Für Produktion einen Owner ohne Superuser-Recht verwenden;
  die Migration legt für die Owner-Rolle eigene Policies an, damit FORCE RLS sie nicht aussperrt.
- Rollen: Owner (alles, Rollen ändern), Admin (Mitglieder einladen und entfernen, Kinderprofile), Mitglied.
  Kinderprofile haben keinen Login. Jede Aktion wird serverseitig geprüft (`src/server/permissions.ts`), zusätzlich RLS.
- Mehrere Familien je Konto: nach der Anmeldung wählt man die aktive Familie (Seite „Familie wählen“). Das Cookie ist an
  den Nutzer gebunden und signiert; Mitgliedschaft und Rolle werden bei jedem Request aus der Datenbank gelesen.
- Rate Limits: Better Auth begrenzt die HTTP-Routen, die Formulare haben ein eigenes Limit. Beide halten ihren Zähler im
  Arbeitsspeicher (eine Instanz); hinter dem Reverse Proxy zusätzlich begrenzen.

## Feedback

Angemeldete Nutzer finden auf jeder Seite unten rechts den Knopf „Feedback“ (mobil über der
Tab-Leiste), dazu „Feedback geben“ im Seitenmenü und eine Kachel auf dem Dashboard. Art, Text,
optional Name, optional ein Bild (Aufnahme der Seite per html2canvas-pro auf Klick oder eigenes PNG/JPEG bis 5 MB).

- Jede Meldung landet zuerst in der Tabelle `feedback` (familienbezogen, RLS), samt Bild als `bytea`.
- Empfänger nur aus der Umgebung (`FEEDBACK_MAIL_TO`), nie im Code oder im Browser.
- Ist `FEEDBACK_MAIL_TO` gesetzt, geht sie über das vorhandene SMTP (`SMTP_URL`, `MAIL_FROM`) als
  reiner Text an diese Adresse, Bild im Anhang, Antwort-Adresse ist die des Absenders. Mitgeschickt:
  Name (falls angegeben), Seite (ohne Query), Version, Browser/Gerät grob, Bildschirmbreite, Familie als Kurz-ID und Rolle.
- Ohne Empfänger oder bei Versandfehler bleibt die Meldung gespeichert (`mailedAt` leer); der Nutzer
  sieht trotzdem „Danke“. Höchstens 10 Meldungen je Konto und Stunde.

## Lizenz und Sicherheit

MIT, siehe [LICENSE](LICENSE). Sicherheitslücken bitte privat melden: [SECURITY.md](SECURITY.md).

## Geheimnisse

Datenbank- und Auth-Zugänge: `.env` lokal, Vorlage `.env.example`, Vault `~/.secrets/plan4ju/`.
