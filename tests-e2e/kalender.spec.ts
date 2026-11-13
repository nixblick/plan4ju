import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { addDays, todayIn } from "../src/lib/week";
import { createFamilyWithOwnerInvitation } from "../src/server/admin";

// Two families: Muster (Anna) uses the calendar, Beispiel (Clara) must see none of it.
const run = randomBytes(4).toString("hex");
const secret = () => randomBytes(12).toString("base64url");
const admin = new PrismaClient({ datasourceUrl: process.env.DATABASE_ADMIN_URL });
const people = {
  anna: { name: "Anna Muster", email: `anna-${run}@example.test`, phrase: secret() },
  clara: { name: "Clara Beispiel", email: `clara-${run}@example.test`, phrase: secret() },
};
const today = todayIn("Europe/Berlin");
const tomorrow = addDays(today, 1);
const EVENT = `Zahnarzt ${run}`;
const EXTERNAL = `Schulfest ${run}`;
const ics = [
  "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//example.test//E2E//DE",
  "BEGIN:VEVENT", `UID:e2e-${run}@example.test`, `DTSTART;VALUE=DATE:${tomorrow.replaceAll("-", "")}`, `SUMMARY:${EXTERNAL}`, "END:VEVENT",
  "END:VCALENDAR", "",
].join("\r\n");

let familyA = "";
let familyB = "";
const sessions: Record<string, Page> = {};

async function join(browser: Browser, token: string, who: { name: string; phrase: string }): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`/einladung/${token}`);
  await page.getByLabel("Dein Name").fill(who.name);
  await page.getByLabel(/^Kennwort/).fill(who.phrase);
  await page.getByRole("button", { name: "Zugang anlegen und beitreten" }).click();
  await expect(page.getByTestId("week")).toBeVisible();
  return page;
}

test.describe.serial("Kalender", () => {
  test.beforeAll(async ({ browser }) => {
    const a = await createFamilyWithOwnerInvitation(admin, { name: "Familie Muster", ownerEmail: people.anna.email });
    const b = await createFamilyWithOwnerInvitation(admin, { name: "Familie Beispiel", ownerEmail: people.clara.email });
    familyA = a.familyId;
    familyB = b.familyId;
    sessions.anna = await join(browser, a.token, people.anna);
    sessions.clara = await join(browser, b.token, people.clara);
  });

  test.afterAll(async () => {
    await Promise.all(Object.values(sessions).map((p) => p.context().close()));
    await admin.family.deleteMany({ where: { id: { in: [familyA, familyB].filter(Boolean) } } });
    await admin.user.deleteMany({ where: { email: { in: Object.values(people).map((p) => p.email) } } });
    await admin.$disconnect();
  });

  test("Termin anlegen: Wochenansicht, Monatsansicht und Startseite zeigen ihn", async () => {
    const p = sessions.anna!;
    await p.goto("/kalender/termin/neu");
    await p.getByLabel("Titel").fill(EVENT);
    await p.getByLabel("Ort (optional)").fill("Praxis am Markt");
    await p.getByLabel("Beginn um").fill("10:30");
    await p.getByRole("checkbox", { name: /Anna Muster/ }).check();
    await p.getByRole("button", { name: "Termin anlegen" }).click();
    await expect(p.getByText("Termin angelegt.")).toBeVisible();
    await expect(p.getByTestId("cal-week")).toContainText(EVENT);
    await expect(p.getByTestId("cal-day-today")).toContainText("10:30 Uhr");
    await expect(p.getByTestId("cal-day-today")).toContainText("Praxis am Markt");

    await p.getByRole("link", { name: "Monat", exact: true }).click();
    await expect(p.getByTestId("cal-month")).toBeVisible();
    await expect(p.getByTestId("cal-cell")).not.toHaveCount(0);
    await p.getByRole("link", { name: /nichts geplant/ }).first().click();
    await expect(p.getByTestId("cal-heading")).toBeVisible();

    await p.goto("/");
    await expect(p.getByTestId("day-today")).toContainText(EVENT);
    await expect(p.getByTestId("today-event")).toContainText(EVENT);
  });

  test("Termin bearbeiten und nur nach Bestätigung löschen", async () => {
    const p = sessions.anna!;
    await p.goto("/kalender");
    await p.getByRole("link", { name: EVENT }).first().click();
    await p.waitForLoadState("networkidle");
    await p.getByLabel("Titel").fill(`${EVENT} neu`);
    await p.getByRole("button", { name: "Änderungen speichern" }).click();
    await expect(p.getByText("Gespeichert.")).toBeVisible();
    await expect(p.getByLabel("Titel")).toHaveValue(`${EVENT} neu`);
    await p.getByText("Endgültig löschen …").click();
    await p.getByRole("button", { name: "Ja, Termin löschen" }).click();
    await expect(p.getByText("Termin gelöscht.")).toBeVisible();
    await expect(p.getByTestId("cal-week")).not.toContainText(EVENT);
  });

  test("ICS-Datei importieren: Termin ist als extern gekennzeichnet, Ausblenden entfernt ihn", async () => {
    const p = sessions.anna!;
    await p.goto("/kalender/quellen");
    await p.getByLabel("ICS-Datei", { exact: true }).first().setInputFiles({ name: "schule.ics", mimeType: "text/calendar", buffer: Buffer.from(ics) });
    await p.getByLabel("Name (leer = Dateiname)").fill("Schule");
    await p.getByRole("button", { name: "Importieren" }).click();
    await expect(p.getByText(/Kalenderdatei importiert/)).toBeVisible();
    await expect(p.getByTestId("calendar-row")).toContainText("Schule");

    await p.goto(`/kalender?datum=${tomorrow}`);
    const item = p.getByTestId("cal-item-external").filter({ hasText: EXTERNAL });
    await expect(item).toBeVisible();
    await expect(item).toContainText("Extern · Schule");
    await expect(item.getByRole("link")).toHaveCount(0); // external events are read only

    await p.goto("/kalender/quellen");
    await p.getByRole("button", { name: "Ausblenden" }).click();
    await p.goto(`/kalender?datum=${tomorrow}`);
    await expect(p.getByTestId("cal-week")).not.toContainText(EXTERNAL);
  });

  test("Ungültige Datei und unzulässige Abo-Adressen werden verständlich abgelehnt, die Adresse bleibt nicht in der URL", async () => {
    const p = sessions.anna!;
    await p.goto("/kalender/quellen");
    await p.getByLabel("ICS-Datei", { exact: true }).first().setInputFiles({ name: "kaputt.ics", mimeType: "text/calendar", buffer: Buffer.from("das ist kein Kalender") });
    await p.getByRole("button", { name: "Importieren" }).click();
    await expect(p.locator("main").getByRole("alert")).toContainText("keine gültige Kalenderdatei");

    for (const url of ["https://127.0.0.1/geheim-token.ics", "http://kalender.example.test/geheim-token.ics", "https://169.254.169.254/latest/meta-data"]) {
      await p.goto("/kalender/quellen");
      await p.getByLabel(/^Adresse/).fill(url);
      await p.getByLabel("Name", { exact: true }).last().fill("Abo");
      await p.getByRole("button", { name: "Abonnieren" }).click();
      await expect(p.locator("main").getByRole("alert")).toContainText("Diese Adresse darf nicht abgerufen werden");
      expect(p.url()).not.toContain("geheim-token");
      expect(p.url()).not.toContain("127.0.0.1");
      expect(await p.content()).not.toContain("geheim-token");
    }
    expect(await admin.externalCalendar.count({ where: { familyId: familyA, kind: "SUBSCRIPTION" } })).toBe(0);
  });

  test("Clara (andere Familie) sieht nichts davon", async () => {
    const p = sessions.clara!;
    await p.goto(`/kalender?datum=${tomorrow}`);
    await expect(p.getByTestId("cal-week")).toBeVisible();
    await expect(p.locator("main")).not.toContainText(EXTERNAL);
    await expect(p.locator("main")).not.toContainText(EVENT);
    await p.goto("/kalender/quellen");
    await expect(p.locator("main")).not.toContainText("Schule");
  });
});
