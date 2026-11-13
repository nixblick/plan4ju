# Master-Prompt für Claude Code: Plan4JU

> Diesen Prompt im Wurzelverzeichnis des GitHub-Repositories `Plan4JU`
> an Claude Code übergeben.\
> Ziel: eine produktionsnah strukturierte, familienorientierte
> Organisations-Web-App entwickeln -- nicht nur ein Mock-up.

------------------------------------------------------------------------

## 1. Deine Rolle und dein Auftrag

Du arbeitest als erfahrener Full-Stack-Softwarearchitekt,
UX/UI-Designer, Datenbankentwickler und Security Engineer.

Entwickle **Plan4JU**, eine moderne, responsive Familienplanungs-App.
Die Anwendung soll sich funktional an der Art von
Familienorganisations-Apps wie Family Cockpit orientieren, aber eine
eigenständige Umsetzung mit eigener Gestaltung, eigenem Code und eigener
Datenstruktur sein. Kopiere weder geschützte Gestaltungselemente noch
Quellcode oder Texte anderer Produkte.

Die Anwendung soll Familien helfen, Aufgaben, Routinen, Termine,
Mahlzeiten, Einkäufe, Wünsche, Ausflugsziele und persönliche
Befindlichkeiten gemeinsam zu organisieren.

Arbeite schrittweise, nachvollziehbar und testgetrieben. Erzeuge keine
reine Demo mit statischen Daten. Implementiere echte Persistenz,
Authentifizierung, Autorisierung und funktionierende Kernabläufe.

**Produktname:** Plan4JU\
**Repository:** `Plan4JU`\
**Sprache der Benutzeroberfläche:** Deutsch\
**Zeitzone:** standardmäßig `Europe/Berlin`, pro Familie konfigurierbar\
**Datumsformat:** `DD.MM.YYYY`\
**Woche:** Montag bis Sonntag\
**Zielgeräte:** iPhone, iPad, Android und Desktop\
**Lizenz:** MIT, sofern keine Abhängigkeit oder Drittkomponente dagegen
spricht

Wenn das Repository bereits Dateien oder Implementierungen enthält,
untersuche diese zuerst und erhalte sinnvolle vorhandene Arbeit.
Überschreibe nichts blind.

------------------------------------------------------------------------

## 2. Vorgehensweise -- verbindlich

Arbeite in diesen Schritten:

1.  Repository und vorhandene Projektstruktur untersuchen.
2.  Eine kurze Bestandsaufnahme und einen konkreten Umsetzungsplan
    erstellen.
3.  `README.md`, `REQUIREMENTS.md`, `ARCHITECTURE.md`, `DATABASE.md`,
    `SECURITY.md` und `ROADMAP.md` anlegen bzw. aktualisieren.
4.  Architektur und Datenmodell festlegen.
5.  Das lauffähige Grundgerüst mit Datenbank, Authentifizierung und
    Familien-Mandantentrennung erstellen.
6.  Danach die Module in der unten definierten Reihenfolge
    implementieren.
7.  Nach jedem Modul Tests ausführen, Fehler beheben und den
    Projektstatus dokumentieren.
8.  Am Ende Installations- und Betriebsanleitungen sowie einen
    nachvollziehbaren Statusbericht liefern.

**Wichtig:** - Nicht versuchen, alle Module in einem einzigen
unübersichtlichen Schritt zu implementieren. - Keine Funktionen nur als
Attrappe oder mit TODO-Buttons ausgeben. - Falls ein externer Dienst
Zugangsdaten benötigt, implementiere eine saubere
Konfigurationsschnittstelle und dokumentiere die Einrichtung. Erfinde
keine API-Endpunkte. - Wenn eine Integration ohne Zugangsdaten oder
externe Freigabe nicht vollständig getestet werden kann, kennzeichne sie
ehrlich als vorbereitet bzw. nicht verifiziert. - Triff sinnvolle
technische Entscheidungen selbstständig. Stelle nur dann Rückfragen,
wenn eine Entscheidung die Architektur wesentlich verändert und nicht
sinnvoll durch einen Standard gelöst werden kann. - Halte `TASKS.md`
oder GitHub Issues aktuell. Markiere erledigte Aufgaben erst nach
erfolgreicher Prüfung als erledigt. - Verwende keine echten Geheimnisse
in Beispieldateien, Tests, Logs oder Git. - Führe Tests, Linting,
Typechecks und Builds regelmäßig aus. Behaupte niemals, ein Test sei
erfolgreich, wenn er nicht ausgeführt wurde.

------------------------------------------------------------------------

## 3. Technischer Stack

Bevorzuge einen gut wartbaren TypeScript-Monolithen. Keine Microservices
für die erste Version.

### Vorgeschlagener Stack

  -----------------------------------------------------------------------
  Bereich                             Technologie
  ----------------------------------- -----------------------------------
  Full-Stack-Framework                Next.js mit App Router

  Sprache                             TypeScript mit striktem Modus

  UI                                  React

  Styling                             Tailwind CSS

  UI-Komponenten                      shadcn/ui oder zugängliche eigene
                                      Komponenten

  Datenbank                           PostgreSQL

  ORM                                 Prisma

  Authentifizierung                   Auth.js oder eine aktuell
                                      gepflegte, kompatible Alternative

  Validierung                         Zod

  Formulare                           React Hook Form

  Karten                              Leaflet + OpenStreetMap

  Kalenderansicht                     FullCalendar oder eine passende
                                      Open-Source-Alternative

  Tests                               Vitest und Playwright

  Container                           Docker und Docker Compose

  CI                                  GitHub Actions

  Paketmanager                        pnpm
  -----------------------------------------------------------------------

Prüfe vor der Installation die aktuelle Kompatibilität der Versionen.
Verwende unterstützte, zueinander passende Versionen und committe die
Lockdatei.

### Architekturprinzipien

-   Modularer Monolith mit klaren fachlichen Modulen.
-   Serverseitige Autorisierung bei jedem geschützten Datenzugriff.
-   Datenbankzugriffe zentral über Services bzw. Repository-Funktionen.
-   Keine Geschäftslogik ausschließlich im Browser.
-   TypeScript strict; möglichst keine untypisierten Daten und kein
    unnötiges `any`.
-   Validierung aller externen und nutzerseitigen Eingaben.
-   Einheitliche Fehlerbehandlung und verständliche Fehlermeldungen.
-   Serverseitige Pagination bei größeren Datenmengen.
-   Zeitzonenbewusste Speicherung und Darstellung von Terminen.
-   Keine unnötige Abhängigkeit von einem einzelnen Hosting-Anbieter.

------------------------------------------------------------------------

## 4. Betriebsmodell: Self-hosted und zentral gehostet

Plan4JU soll **beide Betriebsarten** unterstützen:

1.  **Self-hosted:** Eine Familie betreibt eine eigene Installation,
    beispielsweise auf einem Linux-Server oder einer Synology mit
    Docker.
2.  **Zentral gehostet:** Mehrere Familien nutzen dieselbe Installation.
    Jede Familie besitzt einen strikt getrennten privaten Bereich.

Entwirf die Anwendung von Anfang an mandantenfähig. Auch eine
Einzelinstallation soll dieselbe Mandantenlogik verwenden.

### Anforderungen

-   Jede fachliche Ressource gehört zu einer Familie bzw. einem
    Mandanten, sofern sie nicht ausdrücklich global ist.
-   Jede Abfrage und jede Mutation muss die Berechtigung und
    Familienzugehörigkeit serverseitig prüfen.
-   IDs dürfen nicht als Sicherheitsmechanismus betrachtet werden.
-   Verhindere IDOR- und Cross-Tenant-Zugriffe.
-   Mandanten-IDs niemals ungeprüft aus dem Client übernehmen.
-   Familienwechsel muss explizit und sicher erfolgen.
-   Daten einer Familie dürfen niemals in einer anderen Familie sichtbar
    werden.
-   Dokumentiere, wie eine Self-hosted-Installation auf eine zentrale
    Installation migriert werden kann.
-   Konfiguration erfolgt über Umgebungsvariablen; keine fest
    einkompilierten Hostnamen oder Geheimnisse.

Eine spätere Multi-Domain- oder Subdomain-Unterstützung kann vorbereitet
werden, ist aber keine Voraussetzung für die erste Version.

------------------------------------------------------------------------

## 5. Benutzer, Profile und Familien

Unterscheide strikt zwischen einem **Login-Konto** und einem
**Familienprofil**.

### Login-Konto

-   Registrierung mit Name, E-Mail-Adresse und Passwort.
-   Sicherer Login und Logout.
-   Passwort-Reset über einen sicheren Token-Mechanismus.
-   Passwörter niemals im Klartext speichern oder protokollieren.
-   Sichere Passwort-Hashfunktion, bevorzugt Argon2id, sofern im
    gewählten Auth-Stack sauber unterstützt.
-   Sichere Session-Verwaltung und Cookie-Konfiguration.
-   Schutz vor Brute-Force-Angriffen und Missbrauch der Registrierung.
-   E-Mail-Verifizierung für öffentlich erreichbare Installationen
    vorsehen.
-   In Self-hosted-Entwicklungsumgebungen einen dokumentierten
    Mail-Testmodus ermöglichen.

### Familienprofile

Ein Familienprofil repräsentiert eine Person im Familienbereich. Es kann
mit einem Login-Konto verbunden sein, muss es aber nicht.

Beispiele: - Erwachsene mit eigenem Login. - Kinder ohne Login. -
Weitere Personen wie Großeltern oder Betreuungspersonen.

### Familienverwaltung

-   Familie anlegen.
-   Familienmitglieder einladen.
-   Einladung über einen zeitlich begrenzten, einmalig verwendbaren
    Token.
-   Einladungen widerrufen.
-   Mitglied entfernen.
-   Familienprofil bearbeiten.
-   Rollen und Rechte verwalten.
-   Optional mehrere Familien pro Login-Konto unterstützen.

### Rollen als Ausgangspunkt

-   **Owner:** besitzt und verwaltet die Familie.
-   **Admin:** verwaltet Mitglieder und Einstellungen.
-   **Member:** normale Mitarbeit im Familienbereich.
-   **Child profile:** Profil ohne eigene Anmeldung.

Implementiere Rechte nicht nur über versteckte UI-Elemente. Jede Aktion
muss serverseitig autorisiert werden.

------------------------------------------------------------------------

## 6. Benutzeroberfläche und Bedienkonzept

Gestalte eine freundliche, moderne, ruhige und übersichtliche
Oberfläche. Sie soll für Familien alltagstauglich sein und nicht wie
eine komplexe Verwaltungssoftware wirken.

### Designprinzipien

-   Mobile-first.
-   iPhone-taugliche Touch-Flächen.
-   Gute Lesbarkeit und ausreichende Kontraste.
-   Klare Navigation und wenige Klicks für häufige Aktionen.
-   Responsive Layouts für Smartphone, Tablet und Desktop.
-   Barrierearme Komponenten und Tastaturbedienbarkeit.
-   Einheitliche Farben, Abstände, Typografie und Icons.
-   Keine überladenen Dashboards.
-   Ladezustände, leere Zustände und verständliche Fehlermeldungen
    gestalten.
-   Bestätigungsdialoge bei destruktiven Aktionen.
-   Formulare mit klaren Validierungsmeldungen.
-   Keine horizontal überlaufenden Tabellen auf kleinen Displays.

### Navigation

Auf Desktop beispielsweise eine Seitenleiste. Auf Smartphones eine
kompakte Navigation, etwa als untere Tab-Leiste mit den wichtigsten
Bereichen und einem Menü für weitere Funktionen.

### PWA

-   Web-App-Manifest.
-   App-Icons und passende Startdarstellung.
-   Installation auf iOS und Android ermöglichen.
-   Service Worker nur für geeignete statische Ressourcen und bewusst
    ausgewählte Daten.
-   Keine sensiblen Familiendaten unkontrolliert offline cachen.
-   Offline-Fähigkeit nicht vortäuschen. Falls später
    Offline-Bearbeitung implementiert wird, Konfliktauflösung und
    Synchronisation sauber planen.
-   iOS-Besonderheiten dokumentieren und auf echten Geräten bzw.
    geeigneten Browser-Tests prüfen.

------------------------------------------------------------------------

## 7. Dashboard -- zentrale Startseite

Das Dashboard ist die wichtigste Seite der Anwendung.

Es zeigt standardmäßig die **aktuelle Kalenderwoche von Montag bis
Sonntag**. Die Kalenderwoche muss anhand der konfigurierten
Familienzeitzone korrekt ermittelt werden.

### Dashboard-Inhalte

1.  Wochenübersicht mit Navigation zur vorherigen und nächsten Woche.
2.  Essensplan für Montag bis Sonntag.
3.  Veranstaltungen aus dem Kartenmodul, die in der ausgewählten Woche
    stattfinden.
4.  Eingebundene Kalendertermine.
5.  Aufgaben der Woche mit Fälligkeit und Zuständigkeit.
6.  Geburtstage in der aktuellen Woche.
7.  Routinen bzw. anstehende Routine-Termine.
8.  Schnelle Aktionen zum Erstellen von Aufgabe, Termin, Mahlzeit und
    Einkaufseintrag.

### Darstellung

-   Jede Information muss zur Detailansicht führen.
-   Aufgaben müssen direkt als erledigt markiert werden können, sofern
    berechtigt.
-   Tages- und Wochenbezug deutlich machen.
-   Auf Smartphones Inhalte als gut lesbare Karten oder Abschnitte
    darstellen.
-   Keine irrelevanten leeren Bereiche anzeigen.
-   Zeige bei leeren Modulen einen hilfreichen Einstieg, z. B. „Noch
    kein Essensplan vorhanden".

------------------------------------------------------------------------

## 8. Modul Aufgaben und Zuständigkeiten

Familienmitglieder sollen gemeinsame Aufgaben erstellen und verwalten
können.

### Funktionen

-   Aufgabe erstellen, bearbeiten, archivieren und löschen.
-   Titel und optionale Beschreibung.
-   Optionales Fälligkeitsdatum und Uhrzeit.
-   Eine oder mehrere verantwortliche Personen zuweisen.
-   Aufgabe darf ausdrücklich **keiner Person** zugewiesen sein.
-   Status: offen, in Bearbeitung, erledigt.
-   Optional Priorität.
-   Ersteller speichern.
-   Erstellungs- und Änderungszeitpunkt speichern.
-   Aufgaben nach Status, Person und Zeitraum filtern.
-   Aufgaben in Dashboard und Kalender anzeigen, soweit sinnvoll.
-   Erledigte Aufgaben nachvollziehbar anzeigen.
-   Berechtigungen innerhalb der Familie beachten.

### Datenmodell

Eine Aufgabe kann mehreren Familienprofilen zugeordnet sein. Nutze dafür
eine n:m-Beziehung und nicht ein einzelnes `assigneeId`-Feld.

------------------------------------------------------------------------

## 9. Modul Routinen

Routinen sind wiederkehrende Aufgaben bzw. wiederkehrende
Zuständigkeiten.

### Vordefinierte Routinen

Beim Einrichten einer Familie sollen folgende Vorlagen angeboten werden:

-   Ins Bett bringen
-   Abendessen kochen
-   Kita bringen
-   Kita holen

Die Vorlagen sollen bearbeitbar und erweiterbar sein.

### Funktionen

-   Routine anlegen, bearbeiten, pausieren und archivieren.
-   Titel und Beschreibung.
-   Wiederholungsregel: z. B. täglich, bestimmte Wochentage oder
    benutzerdefinierte Wiederholung.
-   Startdatum und optionales Enddatum.
-   Einzelne Termine einer Routine erzeugen.
-   Ausnahmen und übersprungene Termine unterstützen.
-   Zuständigkeit auf zwei Arten:
    1.  **Fest zugeordnet:** Eine Person ist für alle Termine zuständig.
    2.  **Pro Termin individuell:** Jeder einzelne Routinen-Termin kann
        einer anderen Person zugeordnet werden.
-   Optional mehrere Verantwortliche pro Termin.
-   Termin als erledigt markieren.
-   Dashboard- und Kalenderdarstellung.
-   Änderungen an einer Routine dürfen bereits erledigte oder
    individuell geänderte Termine nicht ungewollt überschreiben.

Verwende eine robuste Wiederholungslogik. Erzeuge nicht unbegrenzt alle
zukünftigen Termine. Berechne einen sinnvollen Zeitraum im Voraus und
dokumentiere das Verhalten.

------------------------------------------------------------------------

## 10. Modul Geburtstage

-   Geburtstage für Familienprofile und weitere Personen erfassen.
-   Name, Geburtsdatum und optionale Notiz.
-   Optional Beziehung bzw. Kategorie.
-   Anzeige des nächsten Geburtstags.
-   Alter nur dort berechnen, wo ein vollständiges Geburtsdatum bekannt
    ist.
-   Dashboard-Anzeige für die aktuelle Woche.
-   Jährliche Wiederholung ohne Verschiebung durch Schaltjahre.
-   Sichtbarkeit innerhalb der Familie entsprechend der Berechtigung.

------------------------------------------------------------------------

## 11. Modul Kalender

Externe Kalender sollen eingebunden werden können.

### Unterstützte Quellen

-   Google Kalender.
-   iCalendar-Abonnements.
-   ICS-Dateien bzw. ICS-Import.

### Anforderungen

-   Kalender pro Familie verwalten.
-   Kalendername und Quelle anzeigen.
-   Kalender aktivieren/deaktivieren.
-   Kalenderfarbe.
-   Importierte Termine in der gemeinsamen Kalenderansicht darstellen.
-   Externe Termine eindeutig als externe Termine kennzeichnen.
-   Synchronisationsstatus und letzter erfolgreicher Abruf anzeigen.
-   Fehler beim Abruf verständlich melden.
-   Doppelte Termine möglichst vermeiden.
-   Zeitzonen und ganztägige Termine korrekt behandeln.

### Sicherheit

-   Kalender-URLs können private Zugangstokens enthalten. Sie sind wie
    Geheimnisse zu behandeln.
-   Keine privaten URLs in Logs oder Fehlermeldungen ausgeben.
-   Abruf externer URLs gegen SSRF absichern: nur geeignete Protokolle,
    private/interne IP-Bereiche blockieren, Redirects kontrollieren,
    Timeouts und Größenlimits setzen.
-   Google OAuth nur mit minimal erforderlichen Berechtigungen.
-   OAuth-Tokens verschlüsselt speichern und niemals an den Browser
    ausgeben.
-   Prüfe aktuelle Google-API-Anforderungen, Quoten und
    Freigabeprozesse.

Unterscheide klar zwischen ICS-Datei-Import (einmaliger Import) und
Kalender-Abonnement (regelmäßiger Abruf). Dokumentiere, welche
Funktionen in der ersten Version tatsächlich umgesetzt sind.

------------------------------------------------------------------------

## 12. Modul Essensplanung und Rezepte

### Wochen-Essensplan

-   Wochenplan von Montag bis Sonntag.
-   Pro Tag optional mehrere Mahlzeiten, mindestens aber eine
    Hauptmahlzeit.
-   Rezept einem Tag zuordnen.
-   Mahlzeit auch ohne Rezept als Freitext erfassen.
-   Mahlzeit bearbeiten und verschieben.
-   Kochzuständigkeit einer oder mehreren Personen zuweisen.
-   Kochzuständigkeit mit dem Aufgabenmodul verknüpfen, ohne
    unkontrolliert doppelte Aufgaben zu erzeugen.
-   Dashboard zeigt den Wochenplan.
-   Familienmitglieder können den Plan einsehen.

### Rezepte

Ein Rezept enthält: - Titel. - Beschreibung bzw. Zubereitung. - Zutaten
mit Menge und Einheit. - Portionen. - Zubereitungszeit. - Optional
Bild. - Allergene bzw. Hinweise. - Kategorien oder Tags. - Quelle/URL. -
Ersteller. - Änderungsdatum.

### Rezepte manuell anlegen

Vollständiges Formular mit Zutatenliste, Mengen, Einheiten und
Zubereitungsschritten.

### Rezepte per URL importieren

-   URL entgegennehmen und serverseitig abrufen.
-   Strukturierte Rezeptdaten bevorzugt aus `schema.org/Recipe` bzw.
    JSON-LD extrahieren.
-   Titel, Zutaten, Mengen, Schritte, Bild und Portionen übernehmen,
    sofern verfügbar.
-   Vor dem Speichern eine Vorschau mit Bearbeitungsmöglichkeit
    anzeigen.
-   Bei nicht unterstützten Seiten manuelle Eingabe ermöglichen.
-   Keine fremden Bilder oder Texte ohne Beachtung der jeweiligen
    Nutzungsrechte dauerhaft spiegeln.
-   SSRF-Schutz, Redirect-Prüfung, Timeout und Größenlimits beachten.
-   Keine beliebigen URLs ungeprüft serverseitig abrufen.

### Rezeptideen per KI

Ein eigener Bereich „Rezeptidee".

Eingaben: - Stichwörter oder vorhandene Zutaten. - Allergene bzw.
auszuschließende Zutaten. - Optional gewünschte Ernährungsweise. -
Optional Zeitaufwand und Portionszahl.

Ausgabe: - Rezeptvorschlag mit Zutaten und Mengen. - Zubereitung. -
Zeitaufwand. - Hinweise zu Allergenen. - Möglichkeit, das Rezept zu
übernehmen und zu speichern.

Die KI-Anbindung muss über einen serverseitigen Provider-Adapter
erfolgen. API-Schlüssel gehören ausschließlich in Umgebungsvariablen.
Die App muss auch ohne KI-Schlüssel vollständig nutzbar bleiben; in
diesem Fall wird die Funktion mit einer verständlichen Meldung
deaktiviert.

Allergenangaben dürfen nicht als medizinische Garantie dargestellt
werden. Weise darauf hin, dass Zutaten und mögliche Kreuzkontamination
vor dem Verzehr geprüft werden müssen.

------------------------------------------------------------------------

## 13. Modul Einkaufsliste

### Einkaufseinträge

Jeder Eintrag besitzt: - Artikelname. - Optionale Menge und Einheit. -
Optional Notiz. - Einen oder mehrere Geschäfte. - Status: offen oder
erledigt. - Ersteller. - Erstellungsdatum.

### Geschäftskategorien

Vordefinierte Geschäfte bzw. Typen: - Supermarkt - Drogerie - Baumarkt -
IKEA

Mehrere Geschäfte pro Eintrag müssen möglich sein. Weitere konkrete
Geschäfte sollen später ergänzbar sein.

### Funktionen

-   Eintrag hinzufügen, bearbeiten und löschen.
-   Erledigt markieren.
-   Nach Geschäft filtern.
-   Mehrere Geschäfte auswählen.
-   Offene und erledigte Einträge unterscheiden.
-   Gemeinsame Liste in Echtzeit oder nach Aktualisierung konsistent
    darstellen.
-   Optional Einträge gruppiert nach Geschäft anzeigen.

### Rezeptzutaten übertragen

Im Rezeptbereich: - Alle Zutaten in die Einkaufsliste übertragen. - Nur
ausgewählte Zutaten übertragen. - Bereits vorhandene passende Einträge
möglichst erkennen und Dubletten vermeiden. - Vor dem Übertragen eine
Auswahl bzw. Vorschau anzeigen. - Nutzer kann Menge, Einheit und
Geschäft vor dem Speichern anpassen. - Übertragene Einträge sollen einen
Bezug zum Rezept behalten können.

------------------------------------------------------------------------

## 14. Modul Wunschzettel

Orientiere dich funktional an klassischen Online-Wunschzetteln,
insbesondere der Idee von meinonlinewunschzettel.de, aber entwickle eine
eigenständige Umsetzung.

### Anforderungen

-   Wunschzettel für jedes Familienmitglied.
-   Zusätzliche Wunschzettel für Personen ohne eigenes Familienprofil.
-   Name und optionale Beschreibung des Wunschzettels.
-   Wunsch mit Titel, Beschreibung und optionalem URL-Link.
-   Optional Preis, Bild-URL und Priorität.
-   Wunsch als erfüllt bzw. reserviert markieren.
-   Optional kann ein Wunsch für andere Familienmitglieder reserviert
    werden.
-   Verhindere, dass eine Person ihren eigenen Überraschungswunsch
    versehentlich als reserviert angezeigt bekommt, wenn dies im
    gewählten Modus nicht gewünscht ist.
-   Sichtbarkeit und Reservierungslogik dokumentieren.
-   Externe Links sicher behandeln und nur als Links darstellen.

------------------------------------------------------------------------

## 15. Modul Karte und Points of Interest

Die Karte basiert auf OpenStreetMap und Leaflet.

### Kategorien -- Startausstattung

-   Ausflugsziel
-   Campingplatz
-   Restaurant
-   Café
-   Spielplatz
-   Veranstaltung
-   Fest
-   Flohmarkt

Zusätzliche Kategorien müssen von berechtigten Familienmitgliedern
angelegt werden können.

### Kategorien verwalten

Jede Kategorie besitzt: - Namen. - Beschreibung optional. - Eigenes
Symbol/Icon. - Optional Farbe. - Aktiv/inaktiv.

Verwende eine kontrollierte Icon-Auswahl aus einer mitgelieferten
Icon-Bibliothek. Keine beliebigen HTML- oder SVG-Fragmente aus
Nutzereingaben rendern.

### POI-Daten

Jeder Punkt besitzt: - Name. - Koordinaten (Latitude/Longitude). -
Kategorie. - URL optional. - Beschreibung optional. - Ersteller. -
Erstellungsdatum. - Optional Beginn und Ende, insbesondere bei
Veranstaltungen. - Optional Adresse. - Optional Bild-URL.

### Funktionen

-   Punkt auf der Karte hinzufügen.
-   Position per Kartenklick setzen und nachträglich verschieben.
-   Marker mit passendem Kategorie-Symbol.
-   Detailansicht mit Name, URL und Beschreibung.
-   Filtern nach Kategorie.
-   Filtern nach Ersteller.
-   Suche nach Namen.
-   Kategorien dynamisch berücksichtigen.
-   Veranstaltungen mit Beginn und Ende verwalten.
-   Abgelaufene temporäre Punkte automatisch aus der aktiven Karte
    entfernen bzw. archivieren.
-   Die automatische Bereinigung darf keine permanenten POIs löschen.
-   Abgelaufene Veranstaltungen sollen nachvollziehbar archiviert
    werden.
-   Zeiträume korrekt in der Familienzeitzone auswerten.

### Kartenbetrieb

-   OpenStreetMap-Kacheln gemäß Nutzungsrichtlinien verwenden.
-   Kachelserver nicht unzulässig belasten.
-   Attribution sichtbar darstellen.
-   Tile-Provider konfigurierbar halten.
-   Keine API-Schlüssel für öffentliche OSM-Standardkacheln erfinden.
-   Kartenansicht auf Smartphone bedienbar gestalten.

------------------------------------------------------------------------

## 16. Modul Achtsamkeit

Jedes Familienmitglied kann für sich Bewertungen erfassen.

### Themengebiete

-   Essen
-   Schlaf
-   Stimmung
-   Arbeit
-   Freizeit
-   Gesundheit

### Bewertung

Pro Themengebiet: - 1 = schlecht - 2 - 3 - 4 - 5 = super

Die Werte werden zusätzlich mit passenden Emojis dargestellt. Die
Zuordnung muss einheitlich und verständlich sein.

### Sichtbarkeit

Jeder Eintrag bzw. jedes Themengebiet muss eine Sichtbarkeit besitzen,
die festlegt, wer die Information sehen darf.

Mögliche Ausgangsoptionen: - Nur ich. - Ausgewählte
Familienmitglieder. - Alle Familienmitglieder.

Die Berechtigungsprüfung muss serverseitig erfolgen. Private Einträge
dürfen weder über API-Endpunkte noch über Dashboard-Abfragen für
unberechtigte Personen sichtbar sein.

### Weitere Anforderungen

-   Datum der Bewertung.
-   Optional Notiz.
-   Verlauf pro Person.
-   Wochen- und Monatsübersicht.
-   Keine medizinische Diagnose oder automatische Bewertung.
-   Gesundheitseinträge besonders restriktiv behandeln.
-   Keine unnötige Offenlegung sensibler Angaben in Logs, Analytics oder
    Benachrichtigungen.

------------------------------------------------------------------------

## 17. Optionale Erweiterung: Supermarktprospekte

Dieses Modul ist nach den Kernfunktionen einzuplanen.

Unterstützte Händler als Ausgangspunkt: - Aldi Süd - Lidl - Edeka -
Rewe - Netto

Prüfe vor der Implementierung, ob rechtmäßige und technisch stabile
Einbindungswege vorhanden sind.

-   Keine nicht autorisierten Scraper entwickeln.
-   Keine fremden Inhalte ungefragt kopieren oder dauerhaft speichern.
-   Wenn Händler keine geeignete Schnittstelle oder Einbettung erlauben,
    biete eine externe Verlinkung an.
-   Händler müssen konfigurierbar sein.
-   Modul kann deaktiviert werden, ohne die übrige Anwendung zu
    beeinflussen.

------------------------------------------------------------------------

## 18. Optionale Erweiterung: FES-Abfallkalender Frankfurt

Prüfe die Möglichkeiten der Integration des FES-Abfallkalenders bzw. der
FES-App FrankfurtPlus.

-   Zuerst offizielle Schnittstellen, Exportmöglichkeiten oder
    dokumentierte Kalenderfeeds recherchieren.
-   Keine privaten oder undokumentierten App-Endpunkte als stabile API
    voraussetzen.
-   Keine Zugangsdaten oder persönliche Adressdaten ungeschützt
    speichern.
-   Wenn eine offizielle ICS- oder API-Anbindung möglich ist,
    implementiere sie über einen Provider-Adapter.
-   Wenn keine verlässliche Schnittstelle verfügbar ist, dokumentiere
    die Einschränkung und biete einen manuellen ICS-Import bzw. eine
    externe Verlinkung an.
-   Das Modul muss optional und unabhängig deaktivierbar sein.

------------------------------------------------------------------------

## 19. Datenmodell -- fachliche Leitplanken

Entwickle ein konsistentes Prisma-Datenmodell. Erstelle eine
verständliche Dokumentation mit ER-Diagramm (Mermaid).

Mindestens folgende Entitäten bzw. fachliche Bereiche berücksichtigen:

-   User
-   Account / Session (entsprechend Auth-Provider)
-   Family
-   FamilyMembership
-   FamilyProfile
-   FamilyInvitation
-   Task
-   TaskAssignment
-   Routine
-   RoutineOccurrence
-   RoutineAssignment
-   Birthday
-   ExternalCalendar
-   ExternalCalendarEvent bzw. synchronisierte Event-Daten
-   MealPlanEntry
-   Recipe
-   RecipeIngredient
-   RecipeStep
-   ShoppingList
-   ShoppingItem
-   ShoppingItemStore
-   Store
-   Wishlist
-   WishlistItem
-   WishlistReservation
-   PoiCategory
-   PointOfInterest
-   MindfulnessEntry
-   MindfulnessVisibility bzw. geeignete ACL-Struktur
-   AuditEvent, soweit für sicherheitsrelevante Änderungen sinnvoll

Das ist eine fachliche Ausgangsliste, keine Vorgabe, jede Entität exakt
so zu implementieren. Normalisiere sinnvoll und vermeide unnötige
Tabellen.

### Datenregeln

-   Eindeutige Primärschlüssel.
-   Fremdschlüssel und sinnvolle Indizes.
-   `createdAt` und `updatedAt` für relevante Datensätze.
-   Familienbezug bei allen mandantenbezogenen Datensätzen.
-   Löschverhalten bewusst festlegen.
-   Bei wichtigen Daten lieber Archivierung/Soft Delete statt
    unbedachter kaskadierender Löschung.
-   Eindeutige Constraints, wo fachlich sinnvoll.
-   Zeitpunkte in UTC speichern und in der Familienzeitzone darstellen.
-   Geburtstage als lokales Datum behandeln, nicht als UTC-Zeitpunkt.
-   Geldbeträge, falls verwendet, als Decimal oder Integer in kleinster
    Währungseinheit speichern, nicht als Float.
-   Migrationsdateien einchecken.

------------------------------------------------------------------------

## 20. Sicherheit und Datenschutz

Plan4JU verarbeitet private Familieninformationen und möglicherweise
sensible Gesundheits- bzw. Stimmungsdaten. Sicherheit ist daher ein
Kernbestandteil und kein späteres Extra.

Setze mindestens um:

-   Serverseitige Authentifizierung und Autorisierung.
-   Strikte Mandantentrennung.
-   Schutz gegen IDOR, CSRF, XSS, SQL-Injection und SSRF.
-   Sichere Cookie- und Session-Konfiguration.
-   Rate Limits für Login, Registrierung, Passwort-Reset und
    KI-Endpunkte.
-   Sichere Passwort-Hashfunktion.
-   Validierung mit Zod oder vergleichbar.
-   Content Security Policy und geeignete Security Headers.
-   Sichere Behandlung externer URLs.
-   Keine Geheimnisse im Repository.
-   `.env.example` nur mit Platzhaltern.
-   Keine sensiblen Daten in Logs.
-   Abhängigkeiten regelmäßig prüfen.
-   Backups und Restore-Verfahren dokumentieren.
-   Datenexport und Löschung personenbezogener Daten berücksichtigen.
-   Aufbewahrungs- und Löschkonzept dokumentieren.
-   Datenschutzfreundliche Voreinstellungen.

Erstelle `SECURITY.md` mit Meldeweg für Sicherheitslücken und
unterstützten Versionen.

Berücksichtige bei einem öffentlichen Hosting die Anforderungen der
DSGVO. Gib keine pauschale Rechtskonformitätsgarantie ab. Dokumentiere,
welche Betreiberpflichten und organisatorischen Maßnahmen noch umgesetzt
werden müssen.

------------------------------------------------------------------------

## 21. Benachrichtigungen und Aktualisierung

Plane eine Erweiterung für Benachrichtigungen, ohne sie unnötig in die
erste Version zu ziehen.

Spätere Möglichkeiten: - In-App-Benachrichtigungen. - Erinnerungen an
Aufgaben. - Erinnerungen an Geburtstage. - Erinnerungen an Routinen. -
Push-Benachrichtigungen, sofern Browser und Betriebssystem dies
unterstützen. - E-Mail-Benachrichtigungen.

Wenn Echtzeit-Updates eingesetzt werden, verwende eine wartbare Lösung.
Die Anwendung muss auch ohne WebSocket-Verbindung konsistent
funktionieren.

------------------------------------------------------------------------

## 22. Tests und Qualitätssicherung

Implementiere Tests für fachliche Kernregeln und Sicherheitsgrenzen.

### Unit-Tests

-   Wochenberechnung Montag bis Sonntag.
-   Zeitzonen und Datumsgrenzen.
-   Wiederholungsregeln von Routinen.
-   Zuweisungen zu mehreren Personen.
-   Aufgaben ohne Zuweisung.
-   Geburtstagsberechnung.
-   Rezeptzutaten-Übertragung.
-   Sichtbarkeitsregeln im Achtsamkeitsmodul.
-   Berechtigungslogik.

### Integrationstests

-   Registrierung und Login.
-   Familie erstellen.
-   Mitglied einladen und Einladung annehmen.
-   Familienübergreifende Zugriffe blockieren.
-   Aufgaben erstellen und zuweisen.
-   Routinen und einzelne Termine verwalten.
-   Rezepte und Einkaufsliste.
-   POIs und temporäre Veranstaltungen.
-   Private Achtsamkeitseinträge schützen.

### End-to-End-Tests mit Playwright

Mindestens folgende Szenarien:

1.  Nutzer registriert sich und erstellt eine Familie.
2.  Nutzer lädt ein weiteres Mitglied ein.
3.  Mitglied nimmt die Einladung an.
4.  Familie erstellt eine Aufgabe und weist sie mehreren Personen zu.
5.  Familie erstellt eine Routine mit fester Zuständigkeit.
6.  Eine einzelne Routine-Ausführung erhält eine abweichende
    Zuständigkeit.
7.  Familie plant ein Essen und überträgt Zutaten auf die Einkaufsliste.
8.  Familie erstellt einen POI und filtert die Karte.
9.  Privater Achtsamkeitseintrag ist für andere Mitglieder nicht
    sichtbar.
10. Nutzer einer zweiten Familie kann keinerlei Daten der ersten Familie
    lesen oder verändern.

### Qualitätsprüfungen

Vor jedem größeren Abschluss: - Lint. - Typecheck. - Unit-Tests. -
Integrationstests. - Build. - Relevante E2E-Tests.

Fehler nicht durch Deaktivieren von Tests oder Abschwächen von Typen
kaschieren.

------------------------------------------------------------------------

## 23. Docker und Deployment

Die Anwendung muss einfach lokal und self-hosted gestartet werden
können.

### Erwartete Dateien

-   `Dockerfile`
-   `docker-compose.yml`
-   `.dockerignore`
-   `.env.example`
-   `README.md`

### Docker Compose

Mindestens: - Plan4JU-App. - PostgreSQL.

Optional später: - Separater Worker für Hintergrundaufgaben. - Redis
nur, wenn eine konkrete technische Notwendigkeit besteht.

### Anforderungen

-   Persistentes PostgreSQL-Volume.
-   Healthchecks.
-   Neustartverhalten.
-   Nicht als root ausführen, sofern technisch möglich.
-   Produktionsbuild statt Entwicklungsserver.
-   Datenbankmigrationen kontrolliert ausführen.
-   Keine automatische Datenbanklöschung beim Neustart.
-   Backup- und Restore-Anleitung.
-   Konfiguration über Environment-Variablen.
-   Reverse-Proxy-Betrieb mit HTTPS dokumentieren.
-   Synology-Docker-/Container-Manager-Betrieb in einer separaten
    Anleitung berücksichtigen.

Erstelle eine Anleitung für: 1. Lokale Entwicklung. 2. Self-hosted
Docker-Installation. 3. Update einer bestehenden Installation. 4. Backup
und Restore. 5. Zentrale Mehrfamilien-Installation.

------------------------------------------------------------------------

## 24. GitHub und Open-Source-Projektpflege

Das Repository soll öffentlich und professionell nutzbar sein.

### Dateien

-   `README.md`
-   `LICENSE` (MIT)
-   `CONTRIBUTING.md`
-   `CODE_OF_CONDUCT.md`
-   `SECURITY.md`
-   `CHANGELOG.md`
-   `REQUIREMENTS.md`
-   `ARCHITECTURE.md`
-   `DATABASE.md`
-   `ROADMAP.md`
-   `.env.example`

### GitHub

-   Issue-Templates für Bug Reports und Feature Requests.
-   Pull-Request-Template.
-   GitHub Actions für Lint, Typecheck, Tests und Build.
-   Dependabot-Konfiguration.
-   Branch Protection als Empfehlung dokumentieren.
-   Keine automatischen Deployments mit ungeschützten Secrets.
-   Keine personenbezogenen Testdaten im Repository.

### README-Inhalte

-   Projektbeschreibung.
-   Screenshots bzw. Platzhalter für Screenshots.
-   Funktionsübersicht.
-   Architekturüberblick.
-   Voraussetzungen.
-   Schnellstart.
-   Docker-Installation.
-   Konfiguration.
-   Testbefehle.
-   Roadmap.
-   Lizenz.
-   Hinweis auf externe Dienste und deren Voraussetzungen.

------------------------------------------------------------------------

## 25. Implementierungsreihenfolge

Setze die Entwicklung in folgenden Releases um. Jede Phase muss einen
lauffähigen, getesteten Zustand hinterlassen.

### Release 0.1 -- Fundament

-   Next.js-Projekt und Designsystem.
-   PostgreSQL und Prisma.
-   Authentifizierung.
-   Benutzerkonto und Familienprofile.
-   Familien erstellen und Einladungen.
-   Mandantentrennung und Rollen.
-   Responsive App-Shell und PWA-Grundlage.
-   Dashboard-Grundgerüst.
-   Docker Compose.
-   CI-Grundlage.

**Abnahmekriterium:** Zwei getrennte Familien können sich registrieren
und anmelden. Mitglieder sehen nur ihre berechtigten Familiendaten. Die
Anwendung läuft lokal und per Docker.

### Release 0.2 -- Familienorganisation

-   Aufgaben.
-   Mehrfachzuweisungen und unzugewiesene Aufgaben.
-   Routinen und Routine-Termine.
-   Geburtstage.
-   Interner Kalender bzw. gemeinsame Terminansicht.
-   ICS-Import und Kalender-Abonnement, soweit sicher umsetzbar.
-   Dashboard-Integration.

**Abnahmekriterium:** Aufgaben und Routinen funktionieren mit festen und
individuellen Zuständigkeiten. Termine und Geburtstage erscheinen
korrekt in der Wochenübersicht.

### Release 0.3 -- Essen und Einkauf

-   Rezepte manuell verwalten.
-   Rezeptimport über URL.
-   Essens-Wochenplan.
-   Kochzuständigkeit.
-   Einkaufsliste mit mehreren Geschäften.
-   Zutaten vollständig oder selektiv übertragen.
-   KI-Rezeptideen über optionalen Provider.

**Abnahmekriterium:** Ein Rezept kann geplant werden; ausgewählte
Zutaten werden nachvollziehbar in die Einkaufsliste übernommen.

### Release 0.4 -- Freizeit und persönliche Übersicht

-   Wunschzettel.
-   OpenStreetMap-Karte.
-   Kategorien und Symbole.
-   POIs.
-   Temporäre Veranstaltungen.
-   Filter nach Kategorie und Ersteller.
-   Achtsamkeitsmodul mit individuellen Sichtbarkeitsrechten.

**Abnahmekriterium:** Familienmitglieder können Freizeitziele teilen.
Private Achtsamkeitseinträge bleiben für unberechtigte Personen
unsichtbar.

### Release 0.5 -- Optionale Integrationen

-   Prospekte, soweit rechtmäßig und technisch stabil einbindbar.
-   FES-Abfallkalender, sofern eine offizielle oder belastbare
    Schnittstelle verfügbar ist.
-   Weitere Kalender- und Benachrichtigungsintegrationen.

**Abnahmekriterium:** Optionale Module können unabhängig aktiviert oder
deaktiviert werden. Fehlende externe Schnittstellen beeinträchtigen
keine Kernfunktion.

------------------------------------------------------------------------

## 26. Erwartete Projektstruktur

Passe die Struktur bei begründetem Bedarf an, aber halte fachliche
Bereiche klar getrennt.

``` text
Plan4JU/
├── .github/
│   ├── ISSUE_TEMPLATE/
│   ├── workflows/
│   ├── pull_request_template.md
│   └── dependabot.yml
├── prisma/
│   ├── migrations/
│   ├── schema.prisma
│   └── seed.ts
├── public/
│   ├── icons/
│   └── manifest.json
├── src/
│   ├── app/
│   │   ├── (auth)/
│   │   ├── (app)/
│   │   │   ├── dashboard/
│   │   │   ├── family/
│   │   │   ├── tasks/
│   │   │   ├── routines/
│   │   │   ├── calendar/
│   │   │   ├── birthdays/
│   │   │   ├── meals/
│   │   │   ├── recipes/
│   │   │   ├── shopping/
│   │   │   ├── wishlist/
│   │   │   ├── map/
│   │   │   └── mindfulness/
│   │   └── api/
│   ├── components/
│   │   ├── ui/
│   │   ├── layout/
│   │   └── shared/
│   ├── features/
│   │   ├── auth/
│   │   ├── family/
│   │   ├── tasks/
│   │   ├── routines/
│   │   ├── calendar/
│   │   ├── meals/
│   │   ├── recipes/
│   │   ├── shopping/
│   │   ├── wishlist/
│   │   ├── map/
│   │   └── mindfulness/
│   ├── lib/
│   ├── server/
│   │   ├── auth/
│   │   ├── db/
│   │   ├── permissions/
│   │   └── integrations/
│   └── types/
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── Dockerfile
├── docker-compose.yml
├── .dockerignore
├── .env.example
├── README.md
├── REQUIREMENTS.md
├── ARCHITECTURE.md
├── DATABASE.md
├── SECURITY.md
├── ROADMAP.md
├── CONTRIBUTING.md
├── CODE_OF_CONDUCT.md
├── CHANGELOG.md
├── LICENSE
└── package.json
```

------------------------------------------------------------------------

## 27. UX- und Funktionsdetails, die nicht vergessen werden dürfen

-   Alle Listen müssen sinnvolle Leerzustände haben.
-   Formulare müssen auf dem iPhone gut bedienbar sein.
-   Datumsauswahl muss mobil funktionieren.
-   Keine wichtigen Funktionen dürfen nur per Hover erreichbar sein.
-   Lange Namen und Beschreibungen dürfen das Layout nicht zerstören.
-   Ladezustände und Fehlerzustände sichtbar machen.
-   Speichern muss eine eindeutige Rückmeldung geben.
-   Doppelte Klicks dürfen keine doppelten Datensätze erzeugen.
-   Kritische Aktionen müssen bestätigt werden.
-   Bei Netzwerkfehlern darf kein falscher Erfolgszustand angezeigt
    werden.
-   Familienmitglieder müssen anhand von Name und optional Avatar
    unterscheidbar sein.
-   Farben und Icons dürfen nicht die einzige Informationsträger sein.
-   Sortierung und Filter müssen nachvollziehbar sein.
-   Lösch- und Archivierungsverhalten muss konsistent sein.

------------------------------------------------------------------------

## 28. Definition of Done

Eine Funktion gilt erst dann als fertig, wenn:

1.  Sie fachlich implementiert ist.
2.  Sie Daten dauerhaft in PostgreSQL speichert, sofern Persistenz
    erforderlich ist.
3.  Berechtigungen serverseitig geprüft werden.
4.  Eingaben validiert werden.
5.  Fehler- und Leerzustände vorhanden sind.
6.  Sie auf Smartphone und Desktop bedienbar ist.
7.  Relevante Unit- und Integrationstests existieren.
8.  Der Build erfolgreich ist.
9.  Dokumentation aktualisiert wurde.
10. Keine bekannten kritischen Sicherheitsprobleme offen sind.

Nicht implementierte externe Integrationen müssen ausdrücklich als nicht
implementiert oder nicht verifiziert gekennzeichnet werden.

------------------------------------------------------------------------

## 29. Dein erster konkreter Arbeitsauftrag

Beginne jetzt mit der Arbeit am vorhandenen Repository.

**Arbeite zunächst nur Release 0.1 vollständig aus.** Erstelle aber
bereits die Dokumentation und Architektur so, dass die späteren Module
sauber ergänzt werden können.

Die ersten konkreten Schritte:

1.  Repository untersuchen.
2.  Projektstruktur und vorhandene Dateien erfassen.
3.  Architekturentscheidungen dokumentieren.
4.  Prisma-Datenmodell für User, Family, Membership, Profile und
    Invitations entwerfen.
5.  Authentifizierung und sichere Mandantentrennung implementieren.
6.  Responsive App-Shell und Dashboard-Grundgerüst erstellen.
7.  Docker- und CI-Konfiguration erstellen.
8.  Tests für Registrierung, Familienverwaltung, Berechtigungen und
    Mandantentrennung schreiben.
9.  Lint, Typecheck, Tests und Produktionsbuild ausführen.
10. README mit exakten Installations- und Startbefehlen
    vervollständigen.

Nach Abschluss von Release 0.1:

-   Liste der implementierten Funktionen ausgeben.
-   Liste der noch offenen Punkte ausgeben.
-   Ausgeführte Tests und deren tatsächliche Ergebnisse nennen.
-   Startbefehle angeben.
-   Bekannte Einschränkungen nennen.
-   Keine nicht getesteten Funktionen als fertig darstellen.

**Warte nach Release 0.1 auf eine Freigabe, bevor du Release 0.2
beginnst.**

Das Ziel ist ein sicheres, wartbares und langfristig erweiterbares
Open-Source-Projekt -- nicht möglichst viel Code in möglichst kurzer
Zeit.
