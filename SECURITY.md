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
- Security headers and a Content Security Policy are set on every response.
- No secrets in the repository; configuration comes from environment variables. CI runs gitleaks.

## Operator notes

- Serve the app only over HTTPS (see README, "Reverse proxy"). Set `BETTER_AUTH_URL` to the https URL.
- Use a long random `BETTER_AUTH_SECRET` and URL-safe random database passwords.
- Run migrations with a table-owner role that is not a superuser; the app role must keep `NOBYPASSRLS`.
- Rate-limit counters live in memory; add limits at the reverse proxy as well.
