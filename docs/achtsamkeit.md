# Achtsamkeit

Jede Person bewertet für sich, wie es ihr in sechs Themen geht: Essen, Schlaf, Stimmung, Arbeit,
Freizeit, Gesundheit. Skala 1 bis 5 mit festen Emojis und Worten:

| Wert | Emoji | Wort |
|---|---|---|
| 1 | 😞 | schlecht |
| 2 | 🙁 | eher schlecht |
| 3 | 😐 | mittel |
| 4 | 🙂 | gut |
| 5 | 😄 | super |

Dazu Datum (lokaler Tag der Familie) und eine optionale Notiz. Ansichten: Woche (Thema × Tag),
Monat (Durchschnitt je Thema), Verlauf je Person, filterbar nach Thema. Keine Diagnose, keine
automatische Bewertung.

Seite: `/achtsamkeit`, Unter-Tab „Achtsamkeit“ im Bereich Familie (die Tab-Leiste bleibt bei 7).

## Wer darf was

- **Autor** ist, wer den Eintrag speichert. Erwachsene schreiben nur für ihr eigenes Profil, Eltern
  zusätzlich für Kinderprofile ohne Login. Nur der Autor ändert oder löscht.
- **Sichtbarkeit je Eintrag**, Voreinstellung „Nur ich“:
  - *Nur ich*: nur der Autor.
  - *Ausgewählte Personen*: der Autor und die angehakten Mitglieder.
  - *Ganze Familie*: alle Mitglieder der Familie.
- **Gesundheit** ist besonders geschützt: nie „Ganze Familie“, höchstens ausgewählte Personen
  (auch als Datenbank-Check).
- **Rollen geben keine Einsicht.** Owner und Admin sehen genau das, was jedes Mitglied sieht.
- **Kinderprofile:** Ein Elternteil, der für ein Kind ohne Login schreibt, ist Autor und entscheidet
  die Sichtbarkeit. Zwei Eltern können dasselbe Kind am selben Tag bewerten; jeder sieht vom anderen
  nur, was freigegeben ist. Bekommt das Kind später ein eigenes Login, bleiben die alten Einträge bei
  den Eltern als Autoren.
- **Austritt:** Verlässt der Autor die Familie, werden seine Einträge gelöscht; verlässt ein
  ausgewähltes Mitglied die Familie, verliert es die Freigabe.

## Durchsetzung

- Row Level Security mit eigenen Policies je Befehl (SELECT, INSERT, UPDATE, DELETE) auf
  `mindfulness_entry` und `mindfulness_share`, nicht nur die Familien-Grenze
  (Migration `mindfulness_rls`). Auch eine direkte SQL-Abfrage mit der App-Rolle (Zählen,
  Durchschnitt, Abruf per ID) sieht nur Erlaubtes.
- `mindfulness_share` liest in seinen Policies nie `mindfulness_entry` (sonst Rekursion);
  `ownerId` ist per zusammengesetztem Fremdschlüssel an den Autor gebunden. Niemand kann sich selbst
  eine Freigabe für fremde Einträge anlegen.
- Unsichtbare und nicht vorhandene IDs ergeben denselben Fehler. Es gibt keine Zähler, Platzhalter
  oder Personen in der Auswahl, die auf verborgene Einträge hindeuten.

## Was nirgends hingeht

- Kein Achtsamkeitsinhalt im Dashboard, in Benachrichtigungen oder Analytics.
- Der Bildschirmfoto-Knopf im Feedback lässt den Achtsamkeitsbereich aus (`data-feedback-ignore`).
- Fehler- und Erfolgsmeldungen tragen nur feste Codes in der Adresse, nie Bewertung oder Notiz;
  die App schreibt Bewertungen und Notizen nicht ins Log (unerwartete Datenbankfehler loggt Next.js mit Fehlertext, ohne Werte aus dem Formular).
- Einen Datenexport gibt es bisher nicht. Kommt einer, enthält er nur die eigenen Einträge.
