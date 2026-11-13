# Plan4JU – Gesamtkonzept

**Stand:** 13.11.2026
**Status:** Umsetzung läuft
**Dokumenttyp:** Fachliches und technisches Gesamtkonzept

Ergänzt `docs/masterprompt.md` und `docs/entscheidungen-0.1.md`. Bei Widerspruch gilt dieses Dokument.

## 1. Ziel und Leitidee

Plan4JU ist eine familienorientierte Organisationsplattform. Sie bündelt die wiederkehrenden und spontanen Aufgaben des Familienalltags an einem zentralen Ort und soll insbesondere auf dem iPhone schnell und komfortabel nutzbar sein.

Die Anwendung soll Familien dabei unterstützen,

- Aufgaben und Zuständigkeiten im Blick zu behalten,
- Termine, Geburtstage und Familienereignisse zu koordinieren,
- Routinen und wiederkehrende Abläufe abzubilden,
- Mahlzeiten und Einkaufslisten zu planen,
- Wünsche und Ideen zu sammeln,
- Orte und Ausflugsziele zu verwalten,
- persönliche Einträge zum Wohlbefinden festzuhalten.

Plan4JU wird modular entwickelt. Der erste Release liefert eine bewusst begrenzte, nutzbare Basis. Weitere Module werden anschließend schrittweise ergänzt.

## 2. Produktgrundsätze

1. **Mobile first:** Die Bedienung auf dem iPhone hat hohe Priorität.
2. **Einfachheit:** Häufige Aktionen müssen mit wenigen Interaktionen erreichbar sein.
3. **Familienorientierung:** Informationen werden innerhalb einer Familie gemeinsam genutzt, soweit ihre Sichtbarkeit dies erlaubt.
4. **Klare Zuständigkeiten:** Aufgaben können einer oder mehreren Personen zugewiesen werden oder bewusst ohne Zuweisung bleiben.
5. **Datenschutz:** Familiendaten sind strikt voneinander getrennt.
6. **Modularität:** Funktionen werden fachlich und technisch voneinander abgegrenzt.
7. **Betriebsfreiheit:** Die Anwendung soll selbst gehostet und später auch als zentral gehosteter Mehrfamilien-Dienst betrieben werden können.
8. **Keine unnötige Komplexität im ersten Release:** Der Umfang von Release 0.1 bleibt verbindlich begrenzt.

## 3. Zielgruppen und Benutzer

### 3.1 Erwachsene Benutzer

Erwachsene Benutzer besitzen ein persönliches Benutzerkonto. Ein Konto kann Mitglied in mehreren Familien sein. Nach dem Login wird eine aktive Familie ausgewählt; ein Wechsel der aktiven Familie muss jederzeit möglich sein.

Die Mitgliedschaft und die jeweilige Rolle gelten immer pro Familie.

### 3.2 Kinderprofile

Kinder werden zunächst als Profile innerhalb einer Familie geführt und benötigen in Release 0.1 kein eigenes Login.

Das Datenmodell soll spätere Kinderkonten mit eingeschränkten Rechten ermöglichen. Die spätere Anmeldung von Kindern darf daher nicht durch eine ausschließlich auf Erwachsene zugeschnittene Datenstruktur verhindert werden.

### 3.3 Rollen und Berechtigungen

Berechtigungen werden familienbezogen verwaltet. Mindestens vorzusehen sind:

- Familienadministration,
- reguläre Familienmitgliedschaft,
- eingeschränkte Berechtigungen für später mögliche Kinderkonten.

Die konkrete Rechteprüfung muss serverseitig erfolgen. Eine reine Ausblendung von Bedienelementen im Frontend ist keine Sicherheitsmaßnahme.

## 4. Funktionsumfang

### 4.1 Familienbereich

Jede Familie besitzt einen eigenen Datenbereich. Dazu gehören unter anderem:

- Familienmitglieder und Kinderprofile,
- Aufgaben und Routinen,
- Termine und Geburtstage,
- Essensplanung und Rezepte,
- Einkaufslisten,
- Wunschlisten,
- Orte und persönliche Einträge.

Ein Benutzer kann mehreren Familien angehören. Daten dürfen niemals versehentlich zwischen Familien sichtbar oder veränderbar werden.

### 4.2 Aufgaben

Aufgaben können mindestens folgende Eigenschaften besitzen:

- Titel und optionale Beschreibung,
- optionales Fälligkeitsdatum,
- Status,
- eine zuständige Person,
- mehrere zuständige Personen,
- keine zuständige Person,
- optionale Kategorie oder Kennzeichnung.

Die Anwendung muss Aufgaben nach Zuständigkeit und Fälligkeit darstellen können. Überfällige Aufgaben und Aufgaben für den aktuellen Tag sollen schnell erkennbar sein.

### 4.3 Routinen

Routinen bilden wiederkehrende Aufgaben und Abläufe ab.

Vorgesehen sind:

- feste Wiederholungsintervalle,
- wiederkehrende Wochentage,
- feste oder je Ausführung wechselnde Zuständigkeiten,
- Vorlagen für typische Familienroutinen.

Routinen sollen später in konkrete Aufgaben beziehungsweise Ausführungen überführt werden können. Die Modellierung muss Wiederholungen nachvollziehbar und wartbar halten.

### 4.4 Termine und Geburtstage

Der Kalender unterstützt:

- Familientermine,
- persönliche Termine,
- Geburtstage,
- externe Kalenderdaten.

Externe Kalender sollen über Google-Kalender-Anbindung und iCal/ICS eingebunden werden können. Die konkrete Synchronisationsrichtung und Konfliktbehandlung werden bei der Umsetzung des Kalender-Moduls festgelegt.

Geburtstage werden als eigenständige Daten gepflegt und zusätzlich im Kalender sowie in einer Vorschau der kommenden Geburtstage angezeigt.

### 4.5 Dashboard

Das Dashboard ist der zentrale Einstiegspunkt.

Für Release 0.1 sind verbindlich drei Bereiche vorgesehen:

1. **Aufgaben:** eigene Aufgaben, heute fällige Aufgaben und überfällige Aufgaben.
2. **Familienwoche:** Wochenansicht von Montag bis Sonntag mit Terminen und Geburtstagen.
3. **Anstehende Geburtstage:** kompakte Übersicht der nächsten Geburtstage.

Das Dashboard wird mobile first umgesetzt. Auf kleinen Displays müssen Inhalte gut lesbar und ohne horizontales Scrollen bedienbar sein.

### 4.6 Essensplanung und Rezepte

Das spätere Essensplanungsmodul umfasst:

- Wochenplanung der Mahlzeiten,
- manuelle Rezepterfassung,
- Import von Rezepten über eine URL,
- Vorschläge für Rezepte durch KI,
- Zutatenlisten,
- Kennzeichnung von Allergenen,
- Übernahme benötigter Zutaten in die Einkaufsliste.

KI-Funktionen sind unterstützend. Übernommene Vorschläge müssen vor der Verwendung überprüfbar und bearbeitbar sein.

### 4.7 Einkaufslisten

Einkaufslisten können familienweit genutzt werden. Vorgesehen sind:

- manuelles Hinzufügen und Abhaken von Artikeln,
- Übernahme von Zutaten aus Rezepten,
- Zuordnung zu Geschäften oder Einkaufsorten,
- gemeinsame Nutzung durch Familienmitglieder.

### 4.8 Wunschlisten

Wunschlisten können für Familienmitglieder und weitere Personen angelegt werden. Ein Wunsch kann mindestens einen Titel und eine optionale Beschreibung enthalten. Weitere Details wie Links, Bilder, Preisangaben oder Erledigungsstatus können im entsprechenden Modul ergänzt werden.

### 4.9 Orte und Karte

Ein Kartenmodul auf Basis von OpenStreetMap (OSM) und Leaflet verwaltet interessante Orte und Ausflugsziele.

Mögliche Kategorien:

- Ausflugsziele,
- Campingplätze,
- Restaurants,
- Cafés,
- Spielplätze,
- Veranstaltungen und Events.

Orte können Kategorien, Beschreibungen und Markierungen erhalten. Filter und eine Kartenansicht erleichtern die Suche.

Zeitlich begrenzte Veranstaltungen erhalten ein Ablaufdatum und sollen nach Ablauf nicht mehr als aktuelle Veranstaltungen erscheinen.

### 4.10 Achtsamkeit und persönliche Einträge

Ein optionales Modul ermöglicht persönliche Einträge zum Alltag und Wohlbefinden. Vorgesehene Themen sind:

- Essen,
- Schlaf,
- Stimmung,
- Arbeit,
- Freizeit,
- Gesundheit.

Die Bewertung kann beispielsweise über Emojis erfolgen. Für jeden Eintrag muss eine Sichtbarkeit festgelegt werden können. Persönliche Einträge dürfen nicht automatisch für alle Familienmitglieder sichtbar sein.

### 4.11 Optionale Integrationen

Als spätere Erweiterungen sind vorgesehen:

- Supermarkt-Prospekte,
- Abfallkalender der FES Frankfurt,
- weitere externe Kalender und Datenquellen.

Diese Integrationen gehören nicht zum Umfang von Release 0.1.

## 5. Release-Plan

### 5.1 Release 0.1 – Basisversion

Release 0.1 ist der verbindliche erste Umsetzungsschritt.

Enthalten sind:

- Benutzerkonten und Anmeldung,
- Einladungssystem für Familien,
- E-Mail-Verifizierung,
- Familien und Familienmitgliedschaften,
- Rollen- und Berechtigungsgrundlage,
- Kinderprofile ohne Login,
- Aufgabenverwaltung,
- Geburtstage,
- Familienwochenansicht,
- Dashboard mit den drei festgelegten Bereichen,
- mobile-first Bedienung und PWA-Grundlage,
- produktionsfähige Bereitstellung unter der vorgesehenen Domain.

Nicht Bestandteil von Release 0.1 sind insbesondere Rezeptverwaltung, Essensplanung, Einkaufslisten, Wunschlisten, Kartenmodul, Achtsamkeitsmodul und optionale externe Integrationen.

### 5.2 Weitere Releases

Die folgenden Module werden nach der stabilen Basis schrittweise umgesetzt:

- Routinen und Vorlagen,
- erweiterter Kalender und externe Kalenderanbindungen,
- Essensplanung und Rezepte,
- Einkaufslisten,
- Wunschlisten,
- Orte und Karten,
- Achtsamkeit und persönliche Einträge,
- optionale externe Integrationen.

Die konkrete Reihenfolge kann anhand von Aufwand und Priorität angepasst werden. Der Funktionsumfang von Release 0.1 wird dadurch nicht stillschweigend erweitert.

## 6. Registrierung und Authentifizierung

### 6.1 Einladungsbasierte Registrierung

Eine öffentliche Selbstregistrierung ist nicht vorgesehen.

Neue Benutzer werden ausschließlich eingeladen. Eine Einladung:

- ist an eine E-Mail-Adresse gebunden,
- kann nur einmal verwendet werden,
- kann widerrufen werden,
- läuft nach sieben Tagen ab.

Vor dem Zugriff auf Familiendaten muss die E-Mail-Adresse verifiziert sein.

### 6.2 Authentifizierungstechnologie

Für die Authentifizierung wird **Better Auth** eingesetzt. Es wird keine eigene Authentifizierungslogik entwickelt.

Vorgesehen sind:

- sichere Passwortspeicherung mit Argon2id,
- E-Mail-Verifizierung,
- sichere Sitzungsverwaltung,
- Passwort-zurücksetzen-Prozess,
- Einladungsprozess.

Sicherheitsrelevante Authentifizierungsfunktionen sollen durch Better Auth bereitgestellt und konfiguriert werden.

## 7. Technische Architektur

### 7.1 Architekturprinzip

Plan4JU wird als modularer Monolith umgesetzt. Fachliche Module werden klar voneinander getrennt, können aber zunächst gemeinsam in einer Anwendung betrieben werden.

Die Architektur soll eine spätere Weiterentwicklung ermöglichen, ohne bereits in Release 0.1 unnötig verteilte Dienste einzuführen.

### 7.2 Vorgesehener Technologie-Stack

| Bereich | Technologie |
|---|---|
| Framework | Next.js mit App Router |
| Sprache | TypeScript im Strict-Modus |
| UI | React |
| Styling | Tailwind CSS |
| UI-Komponenten | shadcn/ui |
| Datenbank | PostgreSQL |
| ORM | Prisma |
| Authentifizierung | Better Auth |
| Validierung | Zod |
| Formulare | React Hook Form |
| Karten | Leaflet und OpenStreetMap |
| Kalender | FullCalendar |
| Unit-/Integrationstests | Vitest |
| End-to-End-Tests | Playwright |
| Container | Docker / Docker Compose |
| Paketmanager | pnpm |
| CI/CD | GitHub Actions |

Abweichungen vom Stack sind zu dokumentieren und müssen einen nachvollziehbaren technischen Grund haben.

### 7.3 Datenbank und Mandantentrennung

Die Anwendung unterstützt mehrere Familien in einer gemeinsamen Installation.

Familiendaten müssen über eine eindeutige Familienzugehörigkeit getrennt werden. Die Mandantentrennung wird auf zwei Ebenen abgesichert:

1. Prüfungen im Service-Layer der Anwendung.
2. PostgreSQL Row-Level Security (RLS).

Die aktive Familien-ID muss requestbezogen gesetzt werden. Der Familienkontext darf nicht unkontrolliert zwischen Requests oder Datenbankverbindungen weiterbestehen.

Besonders zu beachten sind Prisma, Connection Pooling und das sichere Setzen beziehungsweise Zurücksetzen des RLS-Kontexts. Die Implementierung muss automatisiert getestet werden.

### 7.4 Mehrere Familien pro Benutzer

Die Beziehung zwischen Benutzer und Familie ist eine Mitgliedschaft und keine feste Zuordnung.

Ein Benutzer kann mehreren Familien angehören. Rollen und Rechte werden pro Mitgliedschaft gespeichert. Die aktive Familie wird explizit ausgewählt und für jede Anfrage sicher berücksichtigt.

### 7.5 API- und Validierungsprinzipien

- Eingaben werden serverseitig validiert.
- Zod-Schemas dienen der strukturierten Validierung.
- Berechtigungen werden serverseitig geprüft.
- Datenbankzugriffe erfolgen über klar abgegrenzte Services beziehungsweise Repositories.
- Fehler werden einheitlich behandelt.
- Geheimnisse und Zugangsdaten werden nicht im Quellcode abgelegt.

## 8. Sicherheit und Datenschutz

Sicherheit und Datenschutz sind Architekturgrundlagen und keine nachträglichen Ergänzungen.

Verbindliche Anforderungen:

- strikte Trennung der Familiendaten,
- RLS und zusätzliche Service-Layer-Prüfungen,
- sichere Authentifizierung und Sitzungen,
- Argon2id für Passwort-Hashes,
- E-Mail-Verifizierung,
- Schutz vor unberechtigtem Zugriff auf Einladungen,
- serverseitige Autorisierung,
- sichere Behandlung von Secrets,
- HTTPS im Produktivbetrieb,
- nachvollziehbare Fehler- und Sicherheitsprotokollierung,
- datensparsame Speicherung,
- geeignete Lösch- und Aufbewahrungskonzepte.

Automatisierte Tests müssen nachweisen, dass Benutzer einer Familie keine Daten einer anderen Familie lesen oder verändern können.

## 9. E-Mail-Versand

Für Entwicklung und Tests wird **Mailpit** über Docker Compose eingesetzt.

Im Produktivbetrieb wird SMTP konfigurierbar bereitgestellt. Die Anwendung wird nicht fest an einen bestimmten E-Mail-Anbieter gebunden.

SMTP-Zugangsdaten werden ausschließlich über Umgebungsvariablen beziehungsweise Secrets bereitgestellt.

Absender im Produktivbetrieb: `plan4ju@hinjas.de` (Postfach angelegt am 13.11.2026).

## 10. Qualitätssicherung und CI

GitHub Actions führt bei Änderungen mindestens folgende Prüfungen aus:

- ESLint,
- TypeScript-Typecheck,
- Vitest,
- Playwright,
- Docker-Build,
- gitleaks zur Erkennung versehentlich eingecheckter Secrets.

Für den Hauptbranch `main` ist Branch Protection einzurichten. Änderungen sollen nur nach erfolgreichen Prüfungen und gemäß dem festgelegten Review-Prozess übernommen werden.

Besonders wichtige automatisierte Tests:

- Login und Session-Verhalten,
- Einladung und Einladungsablauf,
- E-Mail-Verifizierung,
- Familienwechsel,
- Rollen und Berechtigungen,
- RLS-Isolation,
- Verbot von familienübergreifenden Lese- und Schreibzugriffen,
- zentrale Aufgaben- und Dashboard-Abläufe.

## 11. Betrieb und Infrastruktur

### 11.1 Zielumgebung

Die Anwendung wird auf einem eigenen Linux-Server (Docker) betrieben. Die öffentliche Domain lautet `plan4ju.hinjas.de`.

### 11.2 DNS

Die Subdomain zeigt per A- und AAAA-Record auf die öffentliche IP-Adresse dieses Servers (umgestellt am 13.11.2026), nicht auf einen Webspace. Beim Domain-Anbieter liegen nur DNS und E-Mail.

### 11.3 Reverse Proxy und HTTPS

Für den Produktivbetrieb ist HTTPS verpflichtend. Die Anwendung wird hinter dem bereits vorhandenen Reverse Proxy des Servers betrieben. TLS-Zertifikate und deren Erneuerung müssen zuverlässig eingerichtet werden.

### 11.4 Containerbetrieb

Docker Compose wird für die lokale Entwicklungsumgebung und – soweit passend – für den Betrieb genutzt.

Die benötigten Dienste und Abhängigkeiten müssen nachvollziehbar konfiguriert sein. Entwicklungsdienste wie Mailpit dürfen nicht unbeabsichtigt öffentlich erreichbar sein.

### 11.5 Backups

Ein belastbares Backup-Konzept ist für den Produktivbetrieb erforderlich: regelmäßige Sicherung auf dem Server und eine zusätzliche Kopie an einem zweiten Ort, wie bei den übrigen Diensten des Betreibers. Die Wiederherstellbarkeit muss getestet werden.

## 12. Infrastrukturentscheidungen

| Thema | Status |
|---|---|
| Absender-Mailbox | entschieden: `plan4ju@hinjas.de` |
| DNS | entschieden und umgesetzt: A/AAAA auf den Server, nicht auf Webspace |
| Reverse Proxy | entschieden: vorhandenen Reverse Proxy des Servers mitnutzen |
| Backups | entschieden: Server plus zweite Kopie; Einrichtung beim Rollout |
| TLS/HTTPS | verpflichtend; Einrichtung beim Rollout |

## 13. Repository und vorhandene Artefakte

Im Repository befindet sich ein Artefakt namens `entwurf_dashboard` (ca. 220 KB), dessen Herkunft nicht geklärt ist.

Verbindlicher Umgang damit:

- Datei nicht ungeprüft übernehmen,
- Inhalt und Herkunft prüfen,
- Lizenz beziehungsweise Nutzungsrechte klären,
- erst danach über eine Verwendung entscheiden,
- bis zur Klärung nicht als eigene, freigegebene Implementierung behandeln.

## 14. Logo und Gestaltung

Das Logo ist Gegenstand eines separaten Tickets (#1). Drei Entwürfe liegen vor; die Auswahl steht noch aus.

## 15. Umsetzungsvorgehen

Die Umsetzung erfolgt inkrementell und releaseorientiert.

Grundsätze:

1. Zuerst die technische Basis und Mandantentrennung stabil umsetzen.
2. Release 0.1 strikt auf den vereinbarten Umfang begrenzen.
3. Tests für Sicherheits- und Kernabläufe von Anfang an integrieren.
4. Weitere Module erst nach stabiler Basis ergänzen.
5. Architekturentscheidungen und Abweichungen dokumentieren.
6. Unklare oder fremde Repository-Artefakte nicht ungeprüft übernehmen.
7. Infrastrukturentscheidungen, die erst beim Rollout nötig sind, als offen kennzeichnen und rechtzeitig abschließen.

### 15.1 Abnahmekriterien für Release 0.1

Release 0.1 gilt fachlich und technisch erst dann als abnahmefähig, wenn mindestens folgende Punkte erfüllt sind:

- Ein Benutzer kann sich über eine gültige Einladung registrieren.
- Einladungen sind einmalig, widerrufbar, an eine E-Mail-Adresse gebunden und sieben Tage gültig.
- E-Mail-Verifizierung ist vor dem Zugriff auf Familiendaten erforderlich.
- Ein Benutzer kann Mitglied mehrerer Familien sein.
- Ein Familienwechsel wirkt sich korrekt auf alle Datenzugriffe aus.
- Kinderprofile können ohne eigenes Login angelegt und verwaltet werden.
- Aufgaben können erstellt, bearbeitet, zugewiesen und abgeschlossen werden.
- Aufgaben ohne Zuständigkeit sowie Aufgaben mit mehreren Zuständigen sind möglich.
- Geburtstage können gepflegt und angezeigt werden.
- Das Dashboard zeigt Aufgaben, Familienwoche und anstehende Geburtstage.
- Die Wochenansicht beginnt am Montag und endet am Sonntag.
- Die Bedienung ist auf iPhone-Displays sinnvoll nutzbar.
- Cross-Family-Zugriffe werden durch automatisierte Tests nachweislich verhindert.
- CI-Prüfungen laufen erfolgreich.
- Die Anwendung kann für den vorgesehenen Produktivbetrieb vorbereitet werden.

## 16. Nicht-Ziele für Release 0.1

Um den ersten Release beherrschbar zu halten, sind folgende Funktionen ausdrücklich nicht Teil von Release 0.1:

- vollständige Essens- und Rezeptplanung,
- KI-Rezeptvorschläge,
- Einkaufslisten,
- Wunschlisten,
- Karten- und POI-Verwaltung,
- Achtsamkeits- und Wohlbefindensmodul,
- Supermarkt-Prospekte,
- FES-Abfallkalender,
- vollständige externe Kalender-Synchronisation,
- eigene Kinder-Logins.

Diese Funktionen bleiben Bestandteil der Produktvision und können in späteren Releases umgesetzt werden.

## 17. Zusammenfassung der verbindlichen Entscheidungen

| Bereich | Entscheidung |
|---|---|
| Registrierung | Nur per Einladung, keine öffentliche Selbstregistrierung |
| Einladung | Einmalig, widerrufbar, E-Mail-gebunden, 7 Tage gültig |
| E-Mail | Verifizierung vor Familienzugriff |
| Kinder | Profile ohne Login in Release 0.1 |
| Mehrere Familien | Ein Benutzer kann mehreren Familien angehören |
| Familienauswahl | Explizite Auswahl der aktiven Familie |
| Rollen | Pro Familienmitgliedschaft |
| Authentifizierung | Better Auth |
| Passwort-Hashing | Argon2id |
| Mandantentrennung | Service-Layer-Prüfungen und PostgreSQL RLS |
| Entwicklungs-Mail | Mailpit in Docker Compose |
| Produktiv-Mail | Konfigurierbares SMTP, Absender `plan4ju@hinjas.de` |
| CI | GitHub Actions mit Lint, Typecheck, Vitest, Playwright, Docker-Build und gitleaks |
| Domain | `plan4ju.hinjas.de` |
| DNS | A/AAAA-Record auf den eigenen Server, nicht auf Webspace |
| HTTPS | Im Produktivbetrieb verpflichtend |
| Reverse Proxy | Vorhandenen Reverse Proxy mitnutzen |
| Backup-Ziel | Server plus zweite Kopie |
| Unbekannte Dashboard-Datei | Herkunft und Lizenz vor Verwendung prüfen |
| Logo | Auswahl aus drei Entwürfen steht aus (#1) |

**Leitlinie:** Release 0.1 liefert eine sichere, mobile-first nutzbare Familienbasis. Die umfangreichere Produktvision bleibt erhalten, wird aber modular und erst nach Stabilisierung der Basis umgesetzt.
