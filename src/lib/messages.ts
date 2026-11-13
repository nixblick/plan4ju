export const errorMessages: Record<string, string> = {
  "zu-viele": "Zu viele Versuche. Bitte warte ein paar Minuten.",
  unbestaetigt: "Bitte bestätige zuerst deine E-Mail-Adresse. Wir haben dir einen neuen Link geschickt.",
  ungueltig: "E-Mail-Adresse oder Zugangsdaten stimmen nicht, oder der Link ist abgelaufen.",
  verboten: "Dafür fehlt dir die Berechtigung.",
  konflikt: "Das geht so nicht (zum Beispiel ist die Person schon Mitglied oder es wäre der letzte Owner).",
  "nicht-gefunden": "Eintrag nicht gefunden.",
  einladung: "Diese Einladung ist ungültig, abgelaufen oder wurde schon verwendet.",
  "eingabe-plan": "Bitte prüfe deine Eingaben (Titel oder Name fehlt, Datum oder Uhrzeit ungültig, Enddatum vor dem Start).",
  adresse: "Diese Adresse darf nicht abgerufen werden. Erlaubt ist nur https (oder webcal) ohne Benutzer und Passwort, nicht auf interne Adressen.",
  datei: "Das ist keine gültige Kalenderdatei (iCalendar, .ics).",
  "zu-gross": "Die Kalenderdatei ist zu groß (höchstens 2 MB).",
  "kalender-limit": "Es sind höchstens 10 externe Kalender je Familie möglich.",
  eingabe: "Bitte prüfe deine Eingaben (Kennwort mindestens 10 Zeichen).",
};

export const okMessages: Record<string, string> = {
  eingeladen: "Einladung verschickt. Der Link ist 7 Tage gültig.",
  widerrufen: "Einladung widerrufen.",
  rolle: "Rolle geändert.",
  entfernt: "Mitglied entfernt.",
  kind: "Kinderprofil angelegt.",
  "kind-weg": "Kinderprofil gelöscht.",
  aufgabe: "Aufgabe angelegt.",
  "aufgabe-weg": "Aufgabe gelöscht.",
  geburtstag: "Geburtstag gespeichert.",
  rezept: "Rezept gespeichert.",
  "rezept-weg": "Rezept gelöscht.",
  "geburtstag-weg": "Geburtstag gelöscht.",
  "aufgabe-archiviert": "Aufgabe archiviert. Du findest sie unter „Archiv“.",
  routine: "Routine angelegt.",
  "routine-pausiert": "Routine pausiert. Offene künftige Termine sind entfernt.",
  "routine-aktiv": "Routine ist wieder aktiv.",
  "routine-archiviert": "Routine archiviert.",
  termin: "Termin angelegt.",
  "termin-weg": "Termin gelöscht.",
  "kalender-datei": "Kalenderdatei importiert. Die Termine stehen jetzt im Kalender; die Datei wird nicht erneut abgerufen.",
  "kalender-abo": "Kalender hinzugefügt. Den Abrufstatus siehst du in der Liste.",
  "kalender-abgerufen": "Kalender aktualisiert.",
  "kalender-zu-frueh": "Der Kalender wurde gerade erst abgerufen. Bitte warte eine Minute.",
  "kalender-fehler": "Der Abruf hat nicht geklappt. Den Grund siehst du beim Kalender.",
  "kalender-aktualisiert": "Die Datei wurde neu eingelesen.",
  "kalender-an": "Kalender eingeblendet.",
  "kalender-aus": "Kalender ausgeblendet. Die Termine bleiben gespeichert.",
  "kalender-weg": "Kalender und seine Termine gelöscht.",
  gespeichert: "Gespeichert.",
};

export const roleLabels = { OWNER: "Owner", ADMIN: "Admin", MEMBER: "Mitglied" } as const;

type Param = string | string[] | undefined;
export const one = (p: Param): string | undefined => (Array.isArray(p) ? p[0] : p);
