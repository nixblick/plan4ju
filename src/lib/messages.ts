export const errorMessages: Record<string, string> = {
  "zu-viele": "Zu viele Versuche. Bitte warte ein paar Minuten.",
  unbestaetigt: "Bitte bestätige zuerst deine E-Mail-Adresse. Wir haben dir einen neuen Link geschickt.",
  ungueltig: "E-Mail-Adresse oder Zugangsdaten stimmen nicht, oder der Link ist abgelaufen.",
  verboten: "Dafür fehlt dir die Berechtigung.",
  konflikt: "Das geht so nicht (zum Beispiel ist die Person schon Mitglied oder es wäre der letzte Owner).",
  "nicht-gefunden": "Eintrag nicht gefunden.",
  einladung: "Diese Einladung ist ungültig, abgelaufen oder wurde schon verwendet.",
  "eingabe-plan": "Bitte prüfe deine Eingaben (Titel oder Name fehlt, Datum ungültig).",
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
  "geburtstag-weg": "Geburtstag gelöscht.",
  gespeichert: "Gespeichert.",
};

export const roleLabels = { OWNER: "Owner", ADMIN: "Admin", MEMBER: "Mitglied" } as const;

type Param = string | string[] | undefined;
export const one = (p: Param): string | undefined => (Array.isArray(p) ? p[0] : p);
