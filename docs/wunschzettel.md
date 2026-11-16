# Wunschzettel: Sichtbarkeit und Reservierung

Unter „Geburtstage → Wunschzettel“ (`/wuensche`).

## Listen

- Ein Wunschzettel gehört entweder zu einem **Profil** der Familie (auch Kinderprofile ohne Login) oder zu einer
  **Person ohne Profil** (freier Name, z. B. Oma).
- Optional ist ein **Geburtstag** verknüpft. Die Liste zeigt den nächsten Anlass (verknüpfter Geburtstag,
  Weihnachten am 24.12. oder Ostersonntag, je nach Anlass der Wünsche). Die Geburtstagsseite verlinkt die Liste.
  Wird der Geburtstag gelöscht, bleibt die Liste, nur die Verknüpfung entfällt.
- **Sichtbarkeit:** „Die ganze Familie“ (Standard) oder „Nur ich“. Eine private Liste sieht nur, wer sie angelegt
  hat; das prüft auch die Datenbank (Row Level Security), nicht nur die Oberfläche. Privat stellen darf nur der
  Ersteller.
- **Bearbeiten** (Wünsche anlegen, ändern, löschen, „erhalten“): wer die Liste angelegt hat, die Person des
  Profils und bei Kinderprofilen ohne Login Admins und Owner.

## Wünsche

Titel, Beschreibung, Link, Preis (in Cent gespeichert), Priorität (Herzenswunsch, Würde mich freuen, Kleinigkeit),
Anlass, Bild-Link und Notiz. Links und Bild-Links sind **nur mit `https://`** erlaubt (ohne Benutzer und Kennwort)
und erscheinen nur als Link (`rel="noopener noreferrer nofollow"`, kein Referrer). Bilder werden nicht eingebettet:
kein Abruf fremder Server beim Anzeigen, keine Änderung der Content-Security-Policy.

## Reservierung und Überraschungsschutz

- **Die beschenkte Person** ist das Mitglied, dessen Login am Profil der Liste hängt. Bei Listen für Personen ohne
  Profil gibt es keine beschenkte Person unter den Mitgliedern.
- Alle anderen Mitglieder können einen Wunsch mit „Ich schenke das“ **reservieren**. Sie sehen, wer reserviert hat;
  nur wer reserviert hat, kann die Reservierung aufheben oder „verschenkt“ markieren.
- **Überraschungsmodus** (Standard, je Liste): Die beschenkte Person erfährt nicht, ob reserviert ist.
  - Die Reservierung liegt in einer eigenen Tabelle (`wish_reservation`); Reservieren ändert den Wunsch selbst
    nicht (kein geändertes `updatedAt`).
  - Die Datenbank blendet diese Zeilen für die beschenkte Person aus und verbietet ihr das Anlegen (RLS-Policy
    mit Join auf das Profil; ein Kinderprofil, das später einen Login bekommt, ist sofort geschützt).
  - Versucht sie selbst zu reservieren, kommt immer dieselbe Ablehnung, egal ob schon reserviert ist.
- Die beschenkte Person kann den Überraschungsmodus nicht ausschalten und die Liste keinem anderen Profil oder
  Namen zuordnen (sonst sähe sie die Reservierungen); das darf nur, wer die Liste angelegt hat bzw. bei Kindern
  ohne Login Admin oder Owner. Einschalten darf sie ihn jederzeit.
- **Ohne Überraschungsmodus** sieht die beschenkte Person „Schon reserviert“, aber nie von wem. Auch hier blendet
  die Datenbank ihr die Reservierungszeilen (mit `reservedById`) aus; nur die Funktion
  `app_wish_reserved_for_wisher` nennt ihr die reservierten Wunsch-IDs, ohne Person.
- **Erhalten** markiert die beschenkte Person (oder wer die Liste bearbeitet); das sehen alle.

Getestet in `tests/wishes.test.ts` (Dienst und Datenbank) und `tests-e2e/wuensche.spec.ts`.

## Teilen ohne Konto (0.9)

- Wer einen Wunschzettel bearbeiten darf, erzeugt auf dessen Seite unter „Teilen ohne Konto“ einen Link. Er wird
  **nur einmal** angezeigt; gespeichert ist nur der SHA-256-Hash eines zufälligen 256-Bit-Tokens (Tabelle
  `wishlist_share`, eine Zeile je Liste, RLS: Familie und Sichtbarkeit der Liste).
- „Neuen Link erzeugen“ macht den alten sofort ungültig, „Link widerrufen“ beendet ihn. Der Link endet auch, wenn die
  Liste gelöscht wird, das Modul Wunschzettel aus ist oder die Person, die ihn erzeugt hat, die Familie verlässt.
- Die Seite `/geteilt/wunschzettel/<token>` ist nur lesend und zeigt **nur** den Vornamen der Person und die offenen
  Wünsche (Titel, Beschreibung, https-Link, Preis, Priorität, Anlass). Nie: Reservierungen, wer schenkt, Notizen,
  Titel der Liste, erhaltene Wünsche, hochgeladene Bilder (die brauchen eine Anmeldung). Gelesen wird über die
  `SECURITY DEFINER`-Funktion `app_wishlist_share_lookup`, die genau diese Felder zurückgibt.
- Schlichtes HTML außerhalb des App-Layouts: keine Navigation, keine Analyse, kein Skript; `noindex`, `no-store`,
  `no-referrer`. Grenzen: 120 Abrufe je Link und Stunde, 30 unbekannte Links je Adresse und Stunde; unbekannt,
  widerrufen und ausgeschaltet sehen gleich aus (404).
