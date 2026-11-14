# Karte und Orte (POIs)

Seit 0.3.4/0.3.5, Release 0.4. Erreichbar über die Unter-Navigation „Geburtstage · Wunschzettel · Karte“ (`/karte`).

## Was es gibt

- **Karte** mit Leaflet 1.9 (lokal gebündelt, kein CDN) und Kacheln eines konfigurierbaren Kachel-Servers.
- **Kategorien** mit Name, Beschreibung, Symbol, Farbe, aktiv/aus. Startausstattung je Familie beim ersten Aufruf:
  Ausflugsziel, Campingplatz, Restaurant, Café, Spielplatz, Veranstaltung, Fest, Flohmarkt. Verwalten
  (`/karte/kategorien`) dürfen Admins und Owner. Kategorien werden nur ausgeschaltet, nie gelöscht.
  Symbole stammen aus einem festen, mitgelieferten Satz (`src/lib/map.ts`); aus Eingaben wird kein HTML oder SVG gerendert.
- **Orte** mit Name, Kategorie, Koordinaten (Tipp auf die Karte, Markierung ziehbar, oder Eingabe), Adresse als Text,
  Beschreibung, Notiz, Link und Bild-Link (nur https, nur verlinkt), Bewertung 1–5, Ersteller und Datum.
  Alle Orte sind für die ganze Familie sichtbar; ändern, verschieben und löschen darf der Ersteller oder ein Admin.
- **Filter** nach Kategorie, Ersteller und Name; die Liste steht mobil unter, auf großen Bildschirmen neben der Karte.

## Veranstaltungen (Orte mit Zeitraum)

Ein Ort mit „Von/Bis“ ist temporär (nur „Von“ = eintägig). Nach dem letzten Tag, gerechnet in der Zeitzone der
Familie, setzt der Dienst beim nächsten Aufruf `archivedAt`: der Ort verschwindet von der aktiven Karte und steht
im **Archiv** (`/karte?archiv=1`). Gelöscht wird nichts; Orte ohne Zeitraum werden nie archiviert. Wer den Zeitraum
in die Zukunft verlegt, holt den Ort zurück.

## Kachel-Server und Datenschutz

| Variable | Standard | Bedeutung |
|---|---|---|
| `MAP_TILE_URL` | `https://tile.openstreetmap.org/{z}/{x}/{y}.png` | Kachel-Vorlage, nur https. `{s}` wird in der CSP zu `*.` |
| `MAP_TILE_ATTRIBUTION` | © OpenStreetMap-Mitwirkende | Quellenangabe, sichtbar unten rechts |

- Die CSP (`img-src`) erlaubt genau den Ursprung des konfigurierten Kachel-Servers, sonst nichts Externes.
- Der Browser lädt die Kacheln direkt; der Kachel-Server sieht dabei IP-Adresse, Kartenausschnitt und als Referer
  nur den Ursprung der Instanz. Die Orte selbst verlassen Plan4JU nicht. Die Seite weist darauf hin.
- Die OSM-Standardkacheln sind für geringe Last gedacht ([Tile Usage Policy](https://operations.osmfoundation.org/policies/tiles/)).
  Für eine größere Instanz einen eigenen oder kommerziellen Kachel-Server eintragen. Es gibt keine API-Schlüssel im Code.
- **Adresssuche (seit 0.8)**: über den öffentlichen Nominatim-Dienst der OpenStreetMap Foundation, nur vom Server
  (`/api/karte/suche`, `src/server/geocode.ts`, über `safe-fetch`). Der Browser spricht nie mit Nominatim.
- **„Mein Standort“ (seit 0.8)**: fragt die Geolocation des Browsers, nur auf Klick; die Position wird nur in die Felder
  Breite/Länge geschrieben und erst mit dem Ort gespeichert, sonst nirgends. `Permissions-Policy: geolocation=(self)`;
  die CSP bleibt unverändert (die Suche geht an den eigenen Ursprung).

## Nominatim: Nutzungsbedingungen und Quellenangabe

Grundlage ist die [Nominatim Usage Policy](https://operations.osmfoundation.org/policies/nominatim/) der OSMF. Umgesetzt:

| Vorgabe | Umsetzung |
|---|---|
| höchstens 1 Anfrage pro Sekunde | Abstand ≥ 1 s für den ganzen Server-Prozess (Warteschlange, ab 4 s Wartezeit „beschäftigt“, HTTP 429) |
| Anwendung erkennbar (User-Agent oder Referer) | User-Agent `Plan4JU`, ohne Kontaktdaten oder persönliche Angaben |
| Ergebnisse cachen | Cache im Prozess, 500 Suchtexte, 24 Stunden, auch leere Ergebnisse |
| keine Autovervollständigung | Suche nur auf Knopf oder Enter, ab 3 Zeichen, zweiter Klick innerhalb 1 s wird verworfen |
| Quellenangabe | unter dem Suchfeld: „Suche: Nominatim, Daten © OpenStreetMap-Mitwirkende (ODbL)“ mit Link auf openstreetmap.org/copyright |
| keine Massenabfragen | nur angemeldet, aktive Familie mit eingeschaltetem POI-Modul, 20 Suchen je Nutzer und Minute, Suchtext 3–120 Zeichen |

Der Suchtext wird nicht protokolliert. Für eine größere Instanz einen eigenen Nominatim oder einen kommerziellen Dienst
eintragen (eigene Adresse in `NOMINATIM_URL` in `src/server/geocode.ts`); mehrere Server-Prozesse teilen sich das Limit nicht.

## Technik

Tabellen `map_category` und `poi` mit erzwungener RLS (Familien-Scope), zusammengesetzter Fremdschlüssel
`(categoryId, familyId)`, Checks für Koordinaten, Bewertung, Zeitraum und Farbe. Tests: `tests/map.test.ts`,
`tests/rls.test.ts`, E2E `tests-e2e/karte.spec.ts` (Kacheln werden dort abgebrochen). Adresssuche: `tests/release-0.8.test.ts`
(ohne Netz, Transport ersetzt), `tests-e2e/abnahme-0.8.spec.ts` (Endpunkt im Browser ersetzt).
