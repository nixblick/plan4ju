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
- **ICS-Abo per Adresse**: nur lesend, serverseitig abgerufen, höchstens stündlich (lazy beim Öffnen von Startseite oder Kalender, nach dem Senden der Seite) oder
  manuell einmal je Minute.
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

## Nicht gebaut

- Google- und Apple-Anmeldung (OAuth): später. Bis dahin hilft die geheime iCal-Adresse der Anbieter.
- Ausnahmen einzelner Termine einer eigenen Serie (nur diesen Termin verschieben oder löschen).
- Zurückschreiben in externe Kalender, Erinnerungen, ICS-Export.
- Zusammenführen gleicher Termine aus verschiedenen externen Kalendern.
- Ein regelmäßiger Hintergrundabruf: Abos werden beim Öffnen der Startseite oder des Kalenders aufgefrischt, nicht per Zeitplan.
- Eine gespeicherte Adresse ändern: nicht möglich, Kalender löschen und neu abonnieren (die Adresse wird nie wieder angezeigt). Nach einem Wechsel von `BETTER_AUTH_SECRET` zeigt der Kalender dazu einen eigenen Hinweis.
