# Zusatzmodule (Release 0.5)

Stand 0.4.x. Dieses Dokument sagt, was gebaut ist und was bewusst nicht.

## Schalter

- Je Familie, unter **Familie → Module** (`/familie/module`). Jedes Modul ist zunächst **aus** und wird unabhängig von den
  anderen ein- und ausgeschaltet. Schalten dürfen nur Owner und Admins; die Datenbank prüft das zusätzlich (Trigger auf der
  Tabelle `family`), auch wenn ein Mitglied die Zeile sonst ändern dürfte.
- Ausgeschaltet heißt serverseitig aus: Seiten des Moduls antworten mit „nicht gefunden“, Aktionen werden abgelehnt,
  Kachel und Links verschwinden. Die Einstellungen bleiben erhalten und sind beim Wiedereinschalten zurück.
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

- Unter **Kalender → Abfallkalender** (`/kalender/abfall`) und als Kachel „Abfuhr“ auf der Startseite (nächste 7 Tage).
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
