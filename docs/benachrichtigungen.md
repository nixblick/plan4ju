# Benachrichtigungen und Kalender-Abo

Stand 0.5.3. Umsetzung von Masterprompt Abschnitt 21 und dem ICS-Export aus Abschnitt 11.

## In der App

- Glocke oben (mobil im Kopf, ab `md` in der Seitenleiste) mit Zahl der ungelesenen Benachrichtigungen,
  Liste unter `/benachrichtigungen`. Antippen markiert als gelesen und führt zur Aufgabe, Routine oder zum Geburtstag.
- Arten:
  - **Fällige Aufgaben**: mir zugewiesen, nicht erledigt, heute fällig („Heute fällig“) oder überfällig.
  - **Routinen**: meine offenen Routinen-Termine von heute.
  - **Geburtstage**: am Vortag („Morgen hat … Geburtstag“) und am Tag selbst, für alle Mitglieder.
  - **Neue Zuweisungen**: jemand anderes hat mir eine Aufgabe zugewiesen, und ich habe sie noch nicht
    angenommen oder abgelehnt (Status „neu zugewiesen“, seit 0.7.0). Wer sich selbst zuweist, nimmt
    automatisch an; Kinderprofile ohne Login ebenso.
  - **Abgelehnte Zuweisungen**: jemand hat eine Aufgabe abgelehnt, die ich ihm zugewiesen habe (letzte 7 Tage).
    Die Ablehnung steht in `task_decline` (lesen nur die beiden Beteiligten, schreiben nur wer ablehnt);
    die Benachrichtigung entsteht beim nächsten Seitenaufruf der zuweisenden Person.
- „Heute“ ist der Tag in der Zeitzone der Familie.
- Erzeugt wird **ohne eigenen Dienst**: für den angemeldeten Nutzer beim Seitenaufruf (und im E-Mail-Job).
  Seit 0.7.2 höchstens alle 5 Minuten je Nutzer und Familie, sofort nach einer Änderung an Aufgaben,
  Zuweisungen, Geburtstagen, Routinen oder Einstellungen in der Familie und immer auf `/benachrichtigungen`.
  Dazwischen zählt die Glocke nur (`src/server/notification-sync.ts`, im Speicher, eine Instanz).
  Jede Benachrichtigung hat einen Schlüssel, sie entsteht also nur einmal. Gelesene verschwinden nach 30 Tagen,
  alle nach spätestens 60 Tagen.
- Einstellungen je Nutzer und Familie unter `/benachrichtigungen/einstellungen`: jede Art einzeln, Standard an;
  E-Mail-Zusammenfassung Standard aus.

## Datenschutz und Durchsetzung

- Tabellen `notification`, `notification_pref`, `calendar_feed` mit erzwungener RLS: jede Zeile gehört genau einem
  Nutzer in einer Familie; auch Owner und Admins sehen fremde Zeilen nicht. Fremdschlüssel auf die Mitgliedschaft
  `(familyId, userId)` löscht alles beim Austritt.
- Benachrichtigungen werden nur für den angemeldeten Nutzer selbst angelegt, nie für andere (RLS erlaubt nichts anderes).
- Links in Benachrichtigungen sind nur lokale Pfade (DB-Check).

## Kalender-Abo (ICS-Export)

- Unter Einstellungen erzeugt jeder Nutzer einen **privaten Link** `…/api/kalender/feed/<token>.ics`. Er wird nur
  einmal angezeigt; gespeichert ist nur der SHA-256-Hash. „Neuen Link erzeugen“ macht den alten ungültig,
  „Link widerrufen“ löscht ihn. Verlässt der Nutzer die Familie, ist der Link tot.
- Inhalt: eigene Familientermine (Wiederholungen ausgerollt) und Geburtstage, 30 Tage zurück bis ein Jahr voraus.
  Eingebundene fremde Kalender und Aufgaben werden nicht weitergegeben.
- Der Abruf ist auf 60 je Stunde und Adresse begrenzt, die Antwort ist `private, no-store`.
- Hinweis für den Betrieb: Der Token steht im Pfad und damit im Zugriffsprotokoll eines Reverse Proxys.
  Das lässt sich bei Kalender-Abos nicht vermeiden; Protokolle entsprechend kurz halten oder den Pfad maskieren.
- Die Auflösung des Tokens läuft über die Datenbankfunktion `app_calendar_feed_lookup` (SECURITY DEFINER), danach
  wie jede Anfrage im Familien-Kontext des Nutzers mit RLS.

## Tägliche E-Mail (optional)

- Nur für Nutzer, die sie einschalten. Inhalt: ungelesene Benachrichtigungen der letzten zwei Tage, Link zum Abschalten.
  Ohne neue Benachrichtigungen geht keine Mail raus.
- Versand über das vorhandene SMTP (`SMTP_URL`, `MAIL_FROM`).
- Ausgelöst von außen per Zeitplan (z. B. cron oder systemd-Timer, täglich morgens):

  ```sh
  curl -fsS -X POST -H "Authorization: Bearer $NOTIFY_JOB_TOKEN" https://plan4ju.example.org/api/jobs/digest
  ```

- `NOTIFY_JOB_TOKEN` (mindestens 32 Zeichen, zufällig) steht nur in der Server-Umgebung. Fehlt er oder ist er zu kurz,
  antwortet der Endpunkt mit 404. Er wird nicht von der App erzeugt.
- Je Nutzer und Tag (UTC-Datum des Laufs) höchstens eine Mail: `app_digest_claim` markiert vor dem Versand.
  Scheitert der Versand, gibt `app_digest_unclaim` den Tag zurück (seit 0.7.2): der nächste Lauf am selben Tag
  versucht es erneut. Der Job sollte deshalb morgens mehrmals laufen (zum Beispiel 6, 7 und 8 Uhr).
- Die Mail enthält, was heute fällig und noch ungelesen ist, mit dem Titel von heute: eine ungelesene
  „Morgen hat … Geburtstag“ von gestern erscheint nicht mehr, eine gestern fällige Aufgabe heißt „Überfällig“.

## Web-Push

Nicht gebaut. Web-Push läuft immer über den Push-Dienst des Browserherstellers (Google, Mozilla, Apple), also über einen
Fremddienst, und braucht VAPID-Schlüssel als Geheimnis. Das widerspricht „ohne Fremddienst“. Wer es später will:
Service Worker hat schon einen Platz (`public/sw.js`), es bräuchte eine Tabelle für Abos, VAPID-Schlüssel im Vault und
einen Versand im selben Job wie die E-Mail.
