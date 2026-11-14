# Zusatzmodule (Release 0.5)

Stand 0.4.x. Dieses Dokument sagt, was gebaut ist und was bewusst nicht.

## Schalter

- Je Familie, unter **Einstellungen → Module** (`/einstellungen/module`, bis 0.7 `/familie/module`, leitet um). Schaltbar
  sind acht Module, jedes unabhängig von den anderen: Essen und Rezepte, Wunschzettel, POI (bis 0.7 „Karte“) und Achtsamkeit
  (zu Beginn **an**, damit bestehende Familien nichts verlieren) sowie Prospekte, FES (Abfallkalender, bis 0.7 „Abfuhr“),
  Schule heute und Sterne (zu Beginn **aus**). „Schule heute“ und „Sterne“ sind seit 0.8 Module: Familien, die es vorher schon
  gab, behalten beide an (Migration `release_0_8`), neue Familien starten ohne. Immer an bleiben die Kernfunktionen: Startseite, Kalender, Aufgaben,
  Routinen, Geburtstage, Einkaufsliste und Familie. Schalten dürfen nur Owner und Admins; die Datenbank prüft das zusätzlich (Trigger auf der
  Tabelle `family`), auch wenn ein Mitglied die Zeile sonst ändern dürfte.
- Ausgeschaltet heißt serverseitig aus: Seiten des Moduls antworten mit „nicht gefunden“, Aktionen werden abgelehnt,
  Kachel und Links verschwinden. Durchgesetzt wird das in den Services (`withModule`), nicht nur in der Oberfläche.
  Ausschalten **löscht nichts**: Einträge und Einstellungen bleiben gespeichert und sind beim Wiedereinschalten zurück.
- Ohne „Essen und Rezepte“ führt der Haupt-Tab „Essen“ als „Einkauf“ direkt zur Einkaufsliste; Rezeptzutaten lassen sich dann
  nicht übertragen. „Reminder“ zeigt die Reiter Wunschzettel, POI und Achtsamkeit, soweit an; sind alle drei aus, verschwindet
  der Haupt-Tab.

## Meine Startseite (0.8)

- Je Nutzer und Familie unter **Einstellungen → Module → Meine Startseite**: welche Elemente „Heute“ zeigt (Als Nächstes,
  Heute im Überblick, Diese Woche, Essen heute, FES, Schule heute, Sterne, Termine, Routinen, Aufgaben, Geburtstage,
  Achtsamkeit). Standard: alles, was die Module der Familie erlauben. Ein ausgeschaltetes Modul blendet sein Element für
  alle aus, egal was der Nutzer gewählt hat.
- Gespeichert wird nur die Liste der **ausgeblendeten** Elemente (Tabelle `dashboard_pref`, RLS: nur die eigene Zeile,
  auch Owner sehen fremde Einstellungen nicht). Neue Elemente sind damit automatisch sichtbar; unbekannte Schlüssel werden
  ignoriert. Elemente eines gerade ausgeschalteten Moduls behalten beim Speichern ihre frühere Einstellung.
- Geburtstage auf der Startseite: die letzten 2 und die nächsten 3 Tage („vorgestern“ bis „in 3 Tagen“), auch über den
  Jahreswechsel; die volle Liste steht unter Kalender → Geburtstage.
- Kein Modul ist Voraussetzung für eine Kernfunktion. Startseite, Kalender, Aufgaben und Einkauf lesen nur gespeicherte Daten;
  kein Seitenaufruf wartet auf einen fremden Dienst.

## Prospekte

- Unter **Einkauf → Prospekte** (`/einkauf/prospekte`): Links zu den Prospektseiten der Händler. Sie öffnen sich beim Händler
  (neuer Tab, `noopener noreferrer`).
- Rechtslage und Technik (Masterprompt Abschnitt 17): Uns ist für keinen der genannten Händler (Aldi Süd, Lidl, Edeka, Rewe, Netto) eine
  dokumentierte, freie Schnittstelle oder Einbettung für Prospekte bekannt. Deshalb **kein Scraper, kein Abruf, kein Einbetten, nichts
  gespeichert** außer Name und Adresse des Links.
- Beim ersten Einschalten stehen die fünf Händler mit ihrer Startseite in der Liste. Admins ändern die Adresse auf die
  Prospektseite ihrer Filiale, blenden Händler aus, entfernen sie oder fügen eigene hinzu (höchstens 20, nur `https://`).
  Mitglieder sehen nur die eingeblendeten Links.

## Abfallkalender

- Unter **Kalender → Abfallkalender** (`/kalender/abfall`) und als Kachel „Abfuhr“ auf der Startseite (nächste 7 Tage,
  mit „Heute“ und „Morgen“ in der Zeitzone der Familie, z. B. „Morgen: Biotonne“). Eine Push- oder E-Mail-Erinnerung gibt es nicht.
- Recherche (13.11.2026, Masterprompt Abschnitt 18): Für den FES-Abfallkalender Frankfurt bzw. die App FrankfurtPlus ist **keine
  offizielle, dokumentierte Schnittstelle und kein dokumentierter Kalender-Feed** zu finden. Die App bietet einen Export in den
  Kalender des Telefons; private App-Endpunkte setzen wir nicht voraus.
- Umsetzung als Adapter auf den vorhandenen externen Kalendern (ICS-Datei oder Abo, siehe `docs/kalender.md`): Die Familie legt die
  Termine als ICS-Datei oder Abo-Adresse unter „Externe Kalender“ an, ein Admin wählt diesen Kalender als Abfallkalender. Gibt
  der Entsorger später eine offizielle Adresse heraus, genügt das Abo, ohne neuen Code. Ein Link führt zur Seite der FES.
- Es wird **keine Adresse** (Straße, Hausnummer) gespeichert. Eine Abo-Adresse kann eine Adresse enthalten und wird wie jede
  Abo-Adresse verschlüsselt gespeichert und nie angezeigt.
- Fehlt die Verbindung, zeigt die Seite die zuletzt gespeicherten Termine mit einem Hinweis; der Rest der App merkt nichts.
  Wird der Kalender gelöscht, ist auch die Auswahl weg (Fremdschlüssel mit `ON DELETE SET NULL`).

## Weitere Kalender- und Benachrichtigungsintegrationen

Bewusst noch nicht gebaut (Masterprompt Abschnitt 21 sieht sie als spätere Erweiterung):

- Google- und Apple-Anmeldung (OAuth) für Kalender; bis dahin hilft die geheime iCal-Adresse der Anbieter als Abo.
- Export des Familienkalenders als ICS-Abo.
- Erinnerungen per E-Mail oder Push-Benachrichtigung.

Die App bleibt ohne WebSocket und ohne Hintergrunddienst konsistent: Abos werden beim Öffnen von Startseite oder Kalender nach dem
Senden der Seite aufgefrischt.
