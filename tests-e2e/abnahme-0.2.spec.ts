import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { addDays, todayIn } from "../src/lib/week";
import { createFamilyWithOwnerInvitation } from "../src/server/admin";
import { createInvitation } from "../src/server/services/invitations";

// Release 0.2 acceptance: tasks and routines with fixed and individual responsibility, events and
// birthdays in the week overview, ICS file import, the other family sees nothing, 375 px.
// Everything after the invitation is done through the UI. Screenshots go to ABNAHME_DIR.
const run = randomBytes(4).toString("hex");
const mail = (who: string) => `${who}-${run}@example.test`;
const secret = () => randomBytes(12).toString("base64url");
const q = (s: string) => `„${s}“`;
const admin = new PrismaClient({ datasourceUrl: process.env.DATABASE_ADMIN_URL });
const shots = process.env.ABNAHME_DIR ?? "test-results/abnahme-0.2";
const people = {
  anna: { name: "Anna Muster", email: mail("anna"), phrase: secret() },
  ben: { name: "Ben Muster", email: mail("ben"), phrase: secret() },
  clara: { name: "Clara Beispiel", email: mail("clara"), phrase: secret() },
};
const today = todayIn("Europe/Berlin");
const tomorrow = addDays(today, 1);
const [, m, d] = today.split("-").map(Number) as [number, number, number];
const TASK_BOTH = `Fahrrad reparieren ${run}`;
const TASK_NOBODY = `Keller aufräumen ${run}`;
const FIXED = `Ins Bett bringen ${run}`;
const SINGLE = `Kita holen ${run}`;
const EVENT = `Elternabend ${run}`;
const BIRTHDAY = `Oma Erika ${run}`;
const EXTERNAL = `Schulfest ${run}`;
const SECRETS = [TASK_BOTH, TASK_NOBODY, FIXED, SINGLE, EVENT, BIRTHDAY, EXTERNAL, "Anna Muster", "Ben Muster"];
const ics = [
  "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//example.test//Abnahme//DE",
  "BEGIN:VEVENT", `UID:abnahme-${run}@example.test`, `DTSTART;VALUE=DATE:${today.replaceAll("-", "")}`, `SUMMARY:${EXTERNAL}`, "END:VEVENT",
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

test.describe.serial("Abnahme Release 0.2", () => {
  test.beforeAll(async ({ browser }) => {
    const a = await createFamilyWithOwnerInvitation(admin, { name: "Familie Muster", ownerEmail: people.anna.email });
    const b = await createFamilyWithOwnerInvitation(admin, { name: "Familie Beispiel", ownerEmail: people.clara.email });
    familyA = a.familyId;
    familyB = b.familyId;
    sessions.anna = await join(browser, a.token, people.anna);
    const annaUser = await admin.user.findUniqueOrThrow({ where: { email: people.anna.email } });
    const invite = await createInvitation(annaUser.id, familyA, { email: people.ben.email, role: "MEMBER" });
    sessions.ben = await join(browser, invite.token, people.ben);
    sessions.clara = await join(browser, b.token, people.clara);
  });

  test.afterAll(async () => {
    await Promise.all(Object.values(sessions).map((p) => p.context().close()));
    await admin.family.deleteMany({ where: { id: { in: [familyA, familyB].filter(Boolean) } } });
    await admin.user.deleteMany({ where: { email: { in: Object.values(people).map((p) => p.email) } } });
    await admin.$disconnect();
  });

  test("Aufgaben: zwei Zuständige und eine ohne Zuständige", async () => {
    const p = sessions.anna!;
    await p.goto("/aufgaben");
    await p.getByLabel("Was ist zu tun?").fill(TASK_BOTH);
    await p.getByLabel("Fällig am (optional)").fill(today);
    await p.getByLabel("Anna Muster").check();
    await p.getByLabel("Ben Muster").check();
    await p.getByRole("button", { name: "Aufgabe anlegen" }).click();
    await expect(p.getByText("Aufgabe angelegt.")).toBeVisible();
    const both = p.getByTestId("task-row").filter({ hasText: TASK_BOTH });
    await expect(both).toContainText("Anna Muster");
    await expect(both).toContainText("Ben Muster");
    await p.getByLabel("Was ist zu tun?").fill(TASK_NOBODY);
    await p.getByRole("button", { name: "Aufgabe anlegen" }).click();
    await expect(p.getByTestId("task-row").filter({ hasText: TASK_NOBODY })).toContainText("Niemand zugewiesen");
    await p.screenshot({ path: `${shots}/01-aufgaben.png`, fullPage: true });

    // Ben sees the shared task as his own and ticks it off
    const b = sessions.ben!;
    await b.goto("/");
    await expect(b.getByRole("region", { name: "Meine Aufgaben" })).toContainText(TASK_BOTH);
    await b.goto("/aufgaben");
    await b.getByRole("button", { name: `${q(TASK_BOTH)} abhaken` }).click();
    await expect(b.getByRole("button", { name: `${q(TASK_BOTH)} wieder öffnen` })).toBeVisible();
    await b.goto("/aufgaben?filter=unzugewiesen");
    await expect(b.getByTestId("task-row").filter({ hasText: TASK_NOBODY })).toBeVisible();
  });

  test("Routine fest zugeordnet: Ben bei jedem Termin", async () => {
    const p = sessions.anna!;
    await p.goto("/routinen/neu?vorlage=bett");
    await p.getByLabel("Titel").fill(FIXED);
    await p.getByLabel("Ben Muster").check();
    await p.getByRole("button", { name: "Routine anlegen" }).click();
    await expect(p.getByText("Routine angelegt.")).toBeVisible();
    const rows = p.getByTestId("occurrence-row").filter({ hasText: FIXED });
    for (const i of [0, 1, 2]) await expect(rows.nth(i)).toContainText(/Ben Muster· /);
  });

  test("Routine je Termin einzeln: heute Anna, morgen Ben", async () => {
    const p = sessions.anna!;
    await p.goto("/routinen/neu?vorlage=abendessen");
    await p.getByLabel("Titel").fill(SINGLE);
    await p.getByLabel(/^Je Termin einzeln/).check();
    await p.getByRole("button", { name: "Routine anlegen" }).click();
    await expect(p.getByText("Routine angelegt.")).toBeVisible();
    const rows = p.getByTestId("occurrence-row").filter({ hasText: SINGLE });
    await expect(rows.first()).toContainText("Niemand zugewiesen");
    const routineUrl = p.url();
    for (const [i, who] of [[0, "Anna Muster"], [1, "Ben Muster"]] as const) {
      await p.goto(routineUrl);
      const row = rows.nth(i);
      await row.getByText("Zuständig ändern").click();
      await row.getByLabel(who).check();
      await row.getByRole("button", { name: "Speichern" }).click();
    }
    // the visible assignee line ends with the date; the folded form lists every member
    await expect(rows.nth(0)).toContainText(/Anna Muster· /);
    await expect(rows.nth(1)).toContainText(/Ben Muster· /);
    await expect(rows.nth(2)).toContainText("Niemand zugewiesen");
    await p.screenshot({ path: `${shots}/02-routinen.png`, fullPage: true });

    // Ben ticks off today's fixed routine on the dashboard
    const b = sessions.ben!;
    await b.goto("/");
    const tile = b.getByRole("region", { name: "Routinen heute" });
    await expect(tile).toContainText(FIXED);
    await tile.getByRole("button", { name: `${q(FIXED)} heute abhaken` }).click();
    await expect(tile.getByRole("button", { name: `${q(FIXED)} wieder öffnen` })).toBeVisible();
  });

  test("Termin und Geburtstag erscheinen in der Wochenübersicht", async () => {
    const p = sessions.anna!;
    await p.goto("/kalender/termin/neu");
    await p.getByLabel("Titel").fill(EVENT);
    await p.getByLabel("Beginn am").fill(today);
    await p.getByLabel("Beginn um").fill("21:00");
    await p.getByRole("checkbox", { name: /Ben Muster/ }).check();
    await p.getByRole("button", { name: "Termin anlegen" }).click();
    await expect(p.getByText("Termin angelegt.")).toBeVisible();

    await p.goto("/geburtstage");
    await p.getByLabel("Name", { exact: true }).first().fill(BIRTHDAY);
    await p.getByLabel("Tag").first().fill(String(d));
    await p.getByLabel("Monat").first().selectOption(String(m));
    await p.getByLabel("Geburtsjahr (optional)").first().fill("1950");
    await p.getByRole("button", { name: "Geburtstag speichern" }).click();
    await expect(p.getByText("Geburtstag gespeichert.")).toBeVisible();

    for (const who of ["anna", "ben"]) {
      const s = sessions[who]!;
      await s.goto("/");
      const day = s.getByTestId("week").getByTestId("day-today");
      for (const t of [BIRTHDAY, SINGLE, EVENT]) await expect(day, `${who}: ${t}`).toContainText(t);
    }
    await p.goto(`/kalender?datum=${today}`);
    const cal = p.getByTestId("cal-week");
    for (const t of [EVENT, BIRTHDAY, FIXED, SINGLE]) await expect(cal).toContainText(t);
    await p.goto("/");
    await p.screenshot({ path: `${shots}/03-dashboard-woche.png`, fullPage: true });
  });

  test("ICS-Datei importieren: Termin erscheint als extern", async () => {
    const p = sessions.anna!;
    await p.goto("/kalender/quellen");
    await p.getByLabel("ICS-Datei", { exact: true }).first().setInputFiles({ name: "schule.ics", mimeType: "text/calendar", buffer: Buffer.from(ics) });
    await p.getByLabel("Name (leer = Dateiname)").fill("Schule");
    await p.getByRole("button", { name: "Importieren" }).click();
    await expect(p.getByText(/Kalenderdatei importiert/)).toBeVisible();
    await p.goto(`/kalender?datum=${today}`);
    await expect(p.getByTestId("cal-item-external").filter({ hasText: EXTERNAL })).toContainText("Extern · Schule");
    await p.screenshot({ path: `${shots}/04-kalender-ics.png`, fullPage: true });
    await p.goto("/");
    await expect(p.getByTestId("week").getByTestId("day-today")).toContainText(EXTERNAL);
  });

  test("Andere Familie sieht nichts", async () => {
    const p = sessions.clara!;
    for (const path of ["/", "/aufgaben", "/aufgaben?filter=unzugewiesen", "/routinen", "/geburtstage", "/kalender", "/kalender?ansicht=monat", "/kalender/quellen", `/kalender?datum=${tomorrow}`]) {
      await p.goto(path);
      const body = p.locator("body");
      for (const s of SECRETS) await expect(body, `${path}: ${s}`).not.toContainText(s);
    }
    await p.goto("/");
    await p.screenshot({ path: `${shots}/05-andere-familie.png`, fullPage: true });
  });

  test("375 px ohne Überlauf", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, storageState: await sessions.anna!.context().storageState() });
    const p = await ctx.newPage();
    for (const path of ["/", "/aufgaben", "/routinen", "/routinen/neu", "/geburtstage", "/kalender", "/kalender?ansicht=monat", "/kalender/quellen", "/kalender/termin/neu"]) {
      await p.goto(path);
      await expect(p.locator("main")).toBeVisible();
      const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(over, `${path} overflow`).toBeLessThanOrEqual(0);
      const name = path.replace(/[^a-z]+/g, "-").replace(/^-|-$/g, "") || "start";
      await p.screenshot({ path: `${shots}/375-${name}.png`, fullPage: true });
    }
    await ctx.close();
  });
});
