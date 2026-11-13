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
- **Geocoding** (Adresse → Koordinaten) ist nicht eingebaut; die Adresse ist reiner Text. Kein Dienst wird angefragt.

## Technik

Tabellen `map_category` und `poi` mit erzwungener RLS (Familien-Scope), zusammengesetzter Fremdschlüssel
`(categoryId, familyId)`, Checks für Koordinaten, Bewertung, Zeitraum und Farbe. Tests: `tests/map.test.ts`,
`tests/rls.test.ts`, E2E `tests-e2e/karte.spec.ts` (Kacheln werden dort abgebrochen).
