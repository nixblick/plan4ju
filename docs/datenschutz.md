# Datenschutz: Export, Löschen, Aufbewahrung

Stand 0.5.16. Diese Seite beschreibt, was Plan4JU technisch tut. Sie ist **keine Rechtsberatung**
und ersetzt weder eine Datenschutzerklärung noch eine Prüfung durch den Betreiber.

## Datenexport (Art. 15 und 20 DSGVO)

`Konto → Meine Daten herunterladen` (`GET /api/konto/export`, nur mit Sitzung, 10 Abrufe je Stunde)
liefert eine JSON-Datei (`format: 1`). Sie wird mit der eingeschränkten Datenbankrolle gebaut, je
Familie im eigenen Familienkontext; Row Level Security entscheidet also mit.

Enthalten:

- Konto: Name, E-Mail, Bestätigungsstatus, Anlagedatum
- Mitgliedschaften: Familie, Rolle, seit wann; das eigene Profil je Familie
- alles, was der Nutzer selbst angelegt hat (`createdById`): Aufgaben, Geburtstage, Routinen,
  Termine, externe Kalender (nur Name und Art, keine Adresse), Rezepte, Essensplan,
  Einkaufsposten, Kartenpunkte, geschriebene Wünsche
- eigene Wunschzettel (zum eigenen Profil) mit Wünschen, **ohne** Reservierungen
- eigene Reservierungen für Wünsche anderer
- eigene Achtsamkeitseinträge, bei Freigaben nur die Anzahl, nicht wer
- eigene Feedbacks **ohne** Bildschirmfoto (es kann Daten anderer zeigen)
- eigene Benachrichtigungen und Einstellungen

Nicht enthalten: Einträge anderer Mitglieder, Achtsamkeit anderer, Feedbacks anderer,
Sitzungen und Kennwort-Hash.

## Konto löschen (Art. 17 DSGVO)

`Konto → Konto löschen`, bestätigt mit dem Kennwort und einem Häkchen (5 Versuche je 15 Minuten).
Die Datenbankfunktion `app_delete_own_account()` handelt nur für den angemeldeten Nutzer.

Gelöscht werden: Konto, Sitzungen, Zugangsdaten, Bestätigungs- und Rücksetz-Token,
Mitgliedschaften und daran hängend Achtsamkeitseinträge, Freigaben, Benachrichtigungen,
Einstellungen und Kalender-Abos; Feedbacks; Wunsch-Reservierungen; offene Einladungen an die
E-Mail-Adresse.

Entkoppelt: Das Profil in der Familie verliert die Verbindung zum Konto (wie beim Entfernen eines
Mitglieds), damit Zuweisungen der Familie lesbar bleiben. Den Anzeigenamen kann ein Owner oder
Admin danach ändern oder das Profil löschen.

Bleibt als Familiendaten: Was der Nutzer für die Familie eingetragen hat (Aufgaben, Termine,
Rezepte, Listen, Kartenpunkte, Wünsche auf Listen anderer). Die Urheber-Kennung bleibt als
bedeutungslose ID stehen; sie verweist auf kein Konto mehr.

**Letzter Owner:** Ist der Nutzer einziger Owner einer Familie, wird das Löschen abgelehnt (auch in
der Datenbank, Trigger `app_keep_last_owner`). Er macht vorher jemanden zum Owner
(Familie → Mitglieder) oder löscht die Familie.

## Familie löschen

Ein Owner löscht die aktive Familie unter `Konto → Familie löschen`, bestätigt durch Eingabe des
Familiennamens. `app_delete_active_family()` prüft Rolle und aktiven Familienkontext und löscht die
Familie mit allen Einträgen, Profilen, Mitgliedschaften und Feedbacks. Die Konten der Mitglieder
bleiben; wer keine Familie mehr hat, sieht die Familienauswahl.

## Bilder (Rezepte, Wünsche)

Hochgeladene Bilder (PNG, JPEG, WebP, höchstens 5 MB) liegen in der Datenbank der Familie (Tabelle
`image`, RLS) und sind nur über `/api/bild/<id>` für angemeldete Mitglieder der Familie abrufbar, nie
öffentlich. Der Typ wird an den ersten Bytes erkannt. Metadaten (EXIF mit GPS, XMP, IPTC, Kommentare,
Textblöcke, angehängte Vorschaubilder) werden entfernt, indem die Datei nur aus erlaubten Blöcken neu
zusammengesetzt wird; die Bildpunkte selbst werden nicht neu kodiert (keine native Abhängigkeit). Folge:
Die Drehinformation fehlt, Hochkant-Fotos vom Handy können gedreht erscheinen. Ein Bild verschwindet mit
seinem Rezept, seinem Wunsch oder der Familie. Bilder sind nicht Teil des JSON-Datenexports.

## Aufbewahrung

| Daten | Dauer |
|---|---|
| Familien- und Kontodaten | bis zum Löschen durch Nutzer oder Owner |
| Sitzungen | 14 Tage nach letzter Verlängerung |
| Rücksetz-Token | 1 Stunde |
| Einladungen | bis Annahme, Widerruf oder Ablauf |
| Rate-Limit- und Gerätelisten | nur im Arbeitsspeicher, weg beim Neustart |
| Feedback-Mails | im Postfach des Betreibers, außerhalb der App |
| Sicherungen | nach Sicherungsplan des Betreibers; gelöschte Daten verschwinden erst mit der letzten Sicherung, die sie enthält |

## Pflichten des Betreibers (Hinweis, keine Rechtsgarantie)

Wer Plan4JU für andere betreibt, ist in der Regel Verantwortlicher im Sinne der DSGVO und muss
selbst prüfen und regeln, unter anderem:

- Datenschutzerklärung und, wo nötig, Impressum
- Rechtsgrundlage, besonders für Achtsamkeit (möglicherweise Gesundheitsdaten, Art. 9 DSGVO)
- Verzeichnis der Verarbeitungstätigkeiten, Auftragsverarbeitung mit Hoster und Mail-Dienst
- Aufbewahrungsfrist der Sicherungen festlegen und dokumentieren
- Anfragen, die die App nicht abdeckt (z. B. Berichtigung durch Dritte, Kinderprofile ohne Konto),
  von Hand beantworten: Kinderprofile löscht ein Owner oder Admin unter Familie → Mitglieder
- Meldung von Datenschutzverletzungen (Art. 33/34 DSGVO), Meldeweg in `SECURITY.md`
