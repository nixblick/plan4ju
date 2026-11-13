# Entscheidungen für Release 0.1 (13.11.2026)

Verbindliche Ergänzung zu `docs/masterprompt.md`. Abweichungen vor der Umsetzung begründen und abstimmen.
Der Umfang von 0.1 steht in Issue #2; Module späterer Releases werden nicht vorgezogen.

## Fachlich

1. **Registrierung nur auf Einladung.** Keine öffentliche Selbstregistrierung, E-Mail-Bestätigung Pflicht,
   Einladungen verfallen nach 7 Tagen. Neue Familien legt ein Instanz-Administrator an. Kein anonymer Zugriff.
2. **Kinder:** Profile ohne eigene Anmeldung, von Eltern verwaltet, können Aufgaben zugewiesen bekommen.
   Datenmodell lässt spätere eingeschränkte Kinderzugänge zu.
3. **Mehrere Familien je Konto** von Anfang an. Nach dem Login wird eine aktive Familie gewählt;
   alle Daten und Rechte gelten für die aktive Familie.
4. **Dashboard, mobil zuerst (iPhone):** Aufgaben (eigene, heute fällig, überfällig) · Familienwoche Mo–So
   (Aufgaben und Geburtstage; Termine erst mit dem Kalendermodul) · nächste Geburtstage. Keine Statistiken.

## Technisch

5. **Better Auth** statt Auth.js: E-Mail und Passwort, Argon2id, E-Mail-Bestätigung, sichere Sessions,
   Einladungen, Passwort-Reset vorbereitet. Keine eigene Auth-Logik.
6. **Mandantentrennung doppelt:** Prüfung im Service-Layer und PostgreSQL Row-Level Security.
   Jede familienbezogene Tabelle hat `familyId`; ohne gültigen Familienkontext verweigert die DB.
   Der Kontext wird je Request/Transaktion gesetzt (`SET LOCAL`) und kann nicht zwischen Requests
   hängen bleiben. Fremdzugriffe werden automatisch getestet.
7. **E-Mail:** Mailpit in Docker Compose für Entwicklung und Tests, nie echte Mails in Tests.
   Produktion: SMTP anbieterunabhängig über Umgebungsvariablen, Zugang nur aus Secrets.
8. **CI (GitHub Actions)** bei Push und PR: ESLint, Typecheck, Vitest, Playwright, Docker-Build, gitleaks.
   Branch Protection auf `main`, kein Merge bei roten Prüfungen.
