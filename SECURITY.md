# Security Policy

## Reporting a vulnerability

Please report security problems privately through GitHub: **Security** tab of this repository,
"Report a vulnerability" (private security advisory). Do not open a public issue for a vulnerability.

Include what you found, how to reproduce it and which version or commit is affected.
We aim to acknowledge a report within a few days. Plan4JU is a small project without a
dedicated security team; fixes are made on a best-effort basis and credited if you wish.

## Supported versions

Only the latest release on `main` receives fixes.

## Design in brief

- Each family is a tenant. Every family table is protected by PostgreSQL row level security (forced);
  the app connects with a role that cannot bypass it.
- Registration only by invitation. Passwords are hashed with Argon2id. E-mail verification is required.
- Rate limits on sign-in, password reset and invitations (in-memory counters: per instance).
- Login: failures per e-mail and client address block hard (5 / 15 min); failures per account only slow every further attempt down (1 s doubling to 10 s, one attempt per window, parallel attempts refused), which brakes brute force from rotating addresses without letting a stranger lock the owner out.
- External calendar subscriptions: the address may contain a private key, so it is stored encrypted only (AES-256-GCM, key derived from `BETTER_AUTH_SECRET`), never sent back to the browser, never logged; errors are shown as fixed codes. The server fetches it with SSRF protection: https and port 443 only, no user info, every resolved address must be public, the connection is pinned to the validated address, redirects are re-checked, 10 s and 5 MB limits. Subscriptions are read only.
- Security headers and a Content Security Policy are set on every response.
- No secrets in the repository; configuration comes from environment variables. CI runs gitleaks.

## Operator notes

- Serve the app only over HTTPS (see README, "Reverse proxy"). Set `BETTER_AUTH_URL` to the https URL.
- Use a long random `BETTER_AUTH_SECRET` and URL-safe random database passwords.
- Run migrations with a table-owner role that is not a superuser; the app role must keep `NOBYPASSRLS`.
- Rotating `BETTER_AUTH_SECRET` makes stored calendar subscription addresses unreadable; they must be entered again. Outgoing traffic of the app can additionally be restricted at the network level to public addresses.
- Rate-limit counters live in memory; add limits at the reverse proxy as well.
