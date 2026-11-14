# Kalender (Release 0.2, Block 2)

Stand 0.1.4. Dieses Dokument sagt, was tatsächlich gebaut ist.

## Gebaut

- **Interne Termine** (`/kalender/termin/neu`, `/kalender/termin/[id]`): ganztägig oder mit Uhrzeit, mehrtägig, Ort,
  Beschreibung, Teilnehmer (Profile), Wiederholung wie bei Routinen (täglich, wöchentlich an Wochentagen,
  monatlich, jede n-te Einheit, Ende). Eine Serie wird als Ganzes bearbeitet und gelöscht.
- **Ansichten** (`/kalender`): Woche (Mo–So, je Tag ein Abschnitt) und Monat (Raster mit Punkten, Tag antippen zeigt die
  Einträge darunter). Neben Terminen erscheinen Geburtstage, Routinen und Aufgaben mit Fälligkeit. Reine Server-Seiten, kein
  Skript nötig, bei 375 px ohne Überlauf. Kein FullCalendar: weniger Abhängigkeiten, gleiche Gestaltung wie der Rest.
- **Dashboard**: Termine in den Tageskarten der Woche und Kachel „Termine heute“.
- **ICS-Datei-Import** (`/kalender/quellen`): einmaliger Import, später mit einer neuen Datei ersetzbar.
- **ICS-Abo per Adresse**: nur lesend, serverseitig abgerufen im eingestellten Takt (je Kalender: alle 15 Minuten, stündlich
  (Standard), alle 6 Stunden, täglich), im Hintergrund per Zeitplan (siehe unten) und zusätzlich lazy beim Öffnen von Startseite
  oder Kalender, oder manuell einmal je Minute.
- Externe Termine sind gekennzeichnet („Extern · Name“, Farbe des Kalenders), lassen sich ein- und ausblenden und sind
  nicht bearbeitbar.

## Entscheidungen

- **Zeit**: Termine mit Uhrzeit liegen als UTC-Zeitpunkte in der Datenbank, ganztägige als lokale Tage (letzter Tag
  eingeschlossen; `DTEND` in ICS ist exklusiv und wird umgerechnet). Angezeigt wird in der Zeitzone der Familie. Bei
  Wiederholungen bleibt die Uhrzeit im Wechsel Sommer-/Winterzeit gleich (18:00 bleibt 18:00). Eine nicht existierende
  Uhrzeit (Umstellung im Frühjahr) rückt vor, eine doppelte (Herbst) nimmt die erste.
- **Interne Wiederholungen** werden beim Lesen berechnet, nicht vorab angelegt (es gibt keinen Zustand je Termin).
- **Externe Termine** werden beim Import/Abruf in ein Fenster von 31 Tagen zurück bis 366 Tage voraus aufgelöst
  (höchstens 5000 Einträge je Kalender, sonst „gekürzt“; eine Regel wird höchstens 100000 Schritte weit durchlaufen, damit auch Serien, die vor Jahren begannen, das Fenster erreichen). Wiederholungen mit `RRULE`, `EXDATE` und `RECURRENCE-ID` übernimmt
  `ical.js`. `TZID` ohne `VTIMEZONE` in der Datei wird als IANA-Zone gelesen; Zeiten ohne Zone gelten in der Familienzeitzone.
- **Doppelte** vermeiden: innerhalb eines Kalenders gilt (uid, Beginn) als Schlüssel. Derselbe Termin in zwei verschiedenen
  externen Kalendern wird nicht zusammengeführt.
- Mehrere Kalender: höchstens 10 je Familie; Dateien höchstens 2 MB, Abruf höchstens 5 MB.

## Abo-Adressen sind Geheimnisse

- Gespeichert nur verschlüsselt (AES-256-GCM, Schlüssel per HKDF aus `BETTER_AUTH_SECRET`, gebunden an Familie und
  Kalender). Wird das Secret gewechselt, müssen die Adressen neu eingegeben werden.
- Sie werden nie an den Browser zurückgegeben, auch nicht zum Bearbeiten, und nie geloggt. Fehler erscheinen als feste
  Codes mit deutschem Text, nie mit Meldungen der Netzwerkbibliothek (die enthalten oft die Adresse).
- **SSRF-Schutz** (`src/server/safe-fetch.ts`): nur `https`, nur Port 443, keine Zugangsdaten in der Adresse; der Name wird
  aufgelöst und **jede** Adresse muss öffentlich sein (private, Loopback, Link-Local inklusive Cloud-Metadaten,
  IPv4-in-IPv6, NAT64, 6to4, Multicast, Dokumentationsbereiche gesperrt); verbunden wird genau mit der geprüften Adresse
  (kein zweiter DNS-Aufruf, also keine DNS-Rebinding-Lücke); Weiterleitungen (höchstens 3) werden von Hand verfolgt und
  jedes Mal neu geprüft; 10 Sekunden Gesamtzeit, 5 MB Obergrenze auch für entpackte Antworten.
- Der Abruf läuft ohne offene Datenbank-Transaktion; ein Zeitstempel („Abruf begonnen“) verhindert doppelte Abrufe bei
  parallelen Seitenaufrufen.

## Hintergrundabruf (seit 0.5.20)

- `POST /api/jobs/kalender` frischt alle fälligen Abos aller Familien auf (eingeblendet, nicht pausiert, letzter Abrufversuch
  älter als der eingestellte Takt), höchstens 200 je Lauf, die ältesten zuerst. Die Antwort enthält nur Zahlen
  (`due`, `ok`, `error`, `paused`), keine Namen und keine Adressen.
- Derselbe Lauf versendet Rückmeldungen erneut, deren Mail nicht zugestellt wurde (höchstens 50 je Lauf, Abstände 5 min,
  30 min, 2 h, 12 h; nach 5 Versuchen „fehlgeschlagen“). Die Zahlen stehen unter `feedback` (`due`, `mailed`, `error`,
  `failed`). Owner sehen offene und fehlgeschlagene Meldungen unter `/familie/meldungen`.
- Die Datenbankfunktion `app_calendar_refresh_due` (SECURITY DEFINER) listet nur; jeder Abruf läuft danach wie sonst im
  Familien-Kontext mit RLS, als Ersteller des Kalenders oder, wenn er die Familie verlassen hat, als ältester Eigentümer.
- **Fehler zählen**: jeder fehlgeschlagene Abruf erhöht einen Zähler, ein erfolgreicher setzt ihn zurück. Nach 5 Fehlern
  hintereinander wird das Abo **pausiert**: weder Zeitplan noch Seitenaufruf rufen es mehr ab, die bisherigen Termine
  bleiben sichtbar, die Liste unter „Externe Kalender“ zeigt „pausiert“ mit Hinweis. „Jetzt abrufen“ versucht es erneut;
  klappt es, läuft der Abruf wieder von selbst.
- **Token**: `JOB_TOKEN` (mindestens 32 Zeichen, zufällig) steht nur in der Server-Umgebung, nie im Repo. Die App erzeugt ihn
  nicht. Fehlt er oder ist er zu kurz, antwortet der Endpunkt mit 404. Der Digest-Endpunkt nutzt weiter `NOTIFY_JOB_TOKEN`.

Aufruf per systemd-Timer (alle 15 Minuten; der kürzeste Takt), Token in einer Umgebungsdatei mit Modus 600 außerhalb des Repos:

```ini
# /etc/systemd/system/plan4ju-kalender.service
[Unit]
Description=Plan4JU: Kalender-Abos auffrischen

[Service]
Type=oneshot
EnvironmentFile=/etc/plan4ju/job.env
ExecStart=/bin/sh -c 'curl -fsS -m 300 -X POST -H "Authorization: Bearer $JOB_TOKEN" https://plan4ju.example.org/api/jobs/kalender'

# /etc/systemd/system/plan4ju-kalender.timer
[Unit]
Description=Plan4JU: Kalender-Abos alle 15 Minuten

[Timer]
OnCalendar=*:0/15
RandomizedDelaySec=60
Persistent=true

[Install]
WantedBy=timers.target
```

```sh
systemctl daemon-reload && systemctl enable --now plan4ju-kalender.timer
```

Oder per cron (der Token kommt aus der Umgebungsdatei, nicht aus der crontab):

```cron
*/15 * * * * . /etc/plan4ju/job.env && curl -fsS -m 300 -X POST -H "Authorization: Bearer $JOB_TOKEN" https://plan4ju.example.org/api/jobs/kalender >/dev/null
```

`/etc/plan4ju/job.env` enthält eine Zeile `JOB_TOKEN=…` (Wert aus dem Vault); dieselbe Variable bekommt der App-Container.

## Nicht gebaut

- Google- und Apple-Anmeldung (OAuth): später. Bis dahin hilft die geheime iCal-Adresse der Anbieter.
- Ausnahmen einzelner Termine einer eigenen Serie (nur diesen Termin verschieben oder löschen).
- Zurückschreiben in externe Kalender, Erinnerungen, ICS-Export.
- Zusammenführen gleicher Termine aus verschiedenen externen Kalendern.
- Eine gespeicherte Adresse ändern: nicht möglich, Kalender löschen und neu abonnieren (die Adresse wird nie wieder angezeigt). Nach einem Wechsel von `BETTER_AUTH_SECRET` zeigt der Kalender dazu einen eigenen Hinweis.
