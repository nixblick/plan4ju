import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { todayIn } from "../src/lib/week";
import { createFamilyWithOwnerInvitation } from "../src/server/admin";
import { createInvitation } from "../src/server/services/invitations";

// Two accounts of one family (Muster) and one account of another family (Beispiel).
const run = randomBytes(4).toString("hex");
const mail = (who: string) => `${who}-${run}@example.test`;
const secret = () => randomBytes(12).toString("base64url"); // generated at run time, never stored
const admin = new PrismaClient({ datasourceUrl: process.env.DATABASE_ADMIN_URL });

const people = {
  anna: { name: "Anna Muster", email: mail("anna"), phrase: secret() },
  ben: { name: "Ben Muster", email: mail("ben"), phrase: secret() },
  clara: { name: "Clara Beispiel", email: mail("clara"), phrase: secret() },
};
const today = todayIn("Europe/Berlin");
const [, month, day] = today.split("-").map(Number) as [number, number, number];
const TASK = `Einkaufen ${run}`;
const BIRTHDAY = `Oma Muster ${run}`;
const FOREIGN_TASK = `Fremde Aufgabe ${run}`;
const ROUTINE = `Abendessen ${run}`;
const EDIT_TASK = `Löschtest ${run}`;

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

test.describe.serial("Familienwoche", () => {
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

  test("Anna legt eine Aufgabe und einen Geburtstag an", async () => {
    const p = sessions.anna!;
    await p.goto("/aufgaben");
    await p.getByLabel("Was ist zu tun?").fill(TASK);
    await p.getByLabel("Fällig am (optional)").fill(today);
    await p.getByLabel("Anna Muster").check();
    await p.getByRole("button", { name: "Aufgabe anlegen" }).click();
    await expect(p.getByText("Aufgabe angelegt.")).toBeVisible();
    await expect(p.getByTestId("task-row").filter({ hasText: TASK })).toContainText("Anna Muster");

    // A second task without a due date and without an assignee is allowed.
    await p.getByLabel("Was ist zu tun?").fill(`Ohne Datum ${run}`);
    await p.getByRole("button", { name: "Aufgabe anlegen" }).click();
    await expect(p.getByTestId("task-row").filter({ hasText: `Ohne Datum ${run}` })).toContainText("Niemand zugewiesen");

    await p.goto("/geburtstage");
    await p.getByLabel("Name", { exact: true }).first().fill(BIRTHDAY);
    await p.getByLabel("Tag").first().fill(String(day));
    await p.getByLabel("Monat").first().selectOption(String(month));
    await p.getByLabel("Geburtsjahr (optional)").first().fill("1950");
    await p.getByRole("button", { name: "Geburtstag speichern" }).click();
    await expect(p.getByText("Geburtstag gespeichert.")).toBeVisible();
    await expect(p.getByTestId("birthday-row").filter({ hasText: BIRTHDAY })).toContainText("heute");
  });

  test("Anna kann einen Geburtstag bearbeiten", async () => {
    const p = sessions.anna!;
    await p.goto("/geburtstage");
    const row = p.getByTestId("birthday-row").filter({ hasText: BIRTHDAY });
    await row.getByText("Bearbeiten").click();
    await row.getByLabel("Notiz (optional)").fill("Blumen mitbringen");
    await row.getByRole("button", { name: "Änderungen speichern" }).click();
    await expect(p.getByTestId("birthday-row").filter({ hasText: BIRTHDAY })).toContainText("Blumen mitbringen");
  });

  test("Anna und Ben (gleiche Familie) sehen beides im Wochen-Dashboard, heute hervorgehoben", async () => {
    for (const who of ["anna", "ben"]) {
      const p = sessions[who]!;
      await p.goto("/");
      const week = p.getByTestId("week");
      await expect(week.getByTestId("day")).toHaveCount(6);
      const todayCard = week.getByTestId("day-today");
      await expect(todayCard).toHaveCount(1);
      await expect(todayCard).toContainText(TASK);
      await expect(todayCard).toContainText(BIRTHDAY);
      await expect(p.getByRole("heading", { name: /Familie Muster/ })).toBeVisible();
      await expect(p.getByTestId("clock")).toHaveText(/^\d{2}:\d{2}$/);
      await expect(p.getByTestId("tile-soon").first()).toContainText("kommt bald");
    }
    // Only Anna has the task assigned to herself.
    await expect(sessions.anna!.getByRole("region", { name: "Meine Aufgaben" })).toContainText(TASK);
    await expect(sessions.ben!.getByRole("region", { name: "Meine Aufgaben" })).not.toContainText(TASK);
    await expect(sessions.ben!.getByRole("region", { name: "Heute fällig" })).toContainText(TASK);
  });

  test("Ben hakt die Aufgabe ab", async () => {
    const p = sessions.ben!;
    await p.goto("/aufgaben");
    await p.getByRole("button", { name: `„${TASK}“ abhaken` }).click();
    await expect(p.getByRole("button", { name: `„${TASK}“ wieder öffnen` })).toBeVisible();
    await p.goto("/");
    await expect(p.getByRole("region", { name: "Heute fällig" })).not.toContainText(TASK);
  });

  test("Aufgaben filtern, bearbeiten und nach Bestätigung löschen", async () => {
    const p = sessions.anna!;
    await p.goto("/aufgaben?filter=unzugewiesen");
    await expect(p.getByTestId("task-row").filter({ hasText: `Ohne Datum ${run}` })).toBeVisible();
    await p.goto("/aufgaben?filter=meine");
    await expect(p.locator("body")).not.toContainText(`Ohne Datum ${run}`);
    await p.goto("/aufgaben?filter=erledigt");
    await expect(p.getByTestId("task-row").filter({ hasText: TASK })).toBeVisible();

    await p.goto("/aufgaben");
    await p.getByLabel("Was ist zu tun?").fill(EDIT_TASK);
    await p.getByLabel("Priorität").selectOption("HIGH");
    await p.getByRole("button", { name: "Aufgabe anlegen" }).click();
    await expect(p.getByTestId("task-row").filter({ hasText: EDIT_TASK })).toContainText("Priorität hoch");
    await p.getByRole("link", { name: `„${EDIT_TASK}“ bearbeiten` }).click();
    await p.waitForLoadState("networkidle"); // let React hydrate before typing, or it resets the field
    await p.getByLabel("Beschreibung (optional)").fill("Nur ein Test");
    await p.getByLabel("Status").selectOption("IN_PROGRESS");
    await p.getByRole("button", { name: "Änderungen speichern" }).click();
    await expect(p.getByText("Gespeichert.")).toBeVisible();
    await expect(p.getByLabel("Beschreibung (optional)")).toHaveValue("Nur ein Test");
    // Archive, then delete only after the confirmation step.
    await p.getByRole("button", { name: "Archivieren" }).click();
    await expect(p.getByText(/Aufgabe archiviert/)).toBeVisible();
    await expect(p.locator("body")).not.toContainText(EDIT_TASK);
    await p.goto("/aufgaben?filter=archiv");
    await p.getByRole("link", { name: `„${EDIT_TASK}“ bearbeiten` }).click();
    await expect(p.getByRole("button", { name: "Ja, endgültig löschen" })).toBeHidden();
    await p.getByText("Endgültig löschen …").click();
    await p.getByRole("button", { name: "Ja, endgültig löschen" }).click();
    await expect(p.getByText("Aufgabe gelöscht.")).toBeVisible();
    await expect(p.locator("body")).not.toContainText(EDIT_TASK);
  });

  test("Routine aus Vorlage mit fester Zuständigkeit, ein Termin einzeln für Ben", async () => {
    const p = sessions.anna!;
    await p.goto("/routinen/neu?vorlage=abendessen");
    await expect(p.getByLabel("Titel")).toHaveValue("Abendessen kochen");
    await p.getByLabel("Titel").fill(ROUTINE);
    await p.getByLabel("Anna Muster").check();
    await p.getByRole("button", { name: "Routine anlegen" }).click();
    await expect(p.getByText("Routine angelegt.")).toBeVisible();
    await expect(p.getByTestId("routine-row").filter({ hasText: ROUTINE })).toContainText("täglich");
    const first = p.getByTestId("occurrence-row").filter({ hasText: ROUTINE }).first();
    await expect(first).toContainText("Anna Muster");
    await expect(first).toContainText("18:00 Uhr");

    // individual assignment of this one occurrence
    await first.getByText("Zuständig ändern").click();
    await first.getByLabel("Anna Muster").uncheck();
    await first.getByLabel("Ben Muster").check();
    await first.getByRole("button", { name: "Speichern" }).click();
    const rows = p.getByTestId("occurrence-row").filter({ hasText: ROUTINE });
    await expect(rows.first()).toContainText("Ben Muster");
    await expect(rows.first()).toContainText("einzeln zugewiesen");
    await expect(rows.nth(1)).toContainText("Anna Muster");

    // Dashboard: shown for today and in the week, can be ticked off
    await p.goto("/");
    const tile = p.getByRole("region", { name: "Routinen heute" });
    await expect(tile).toContainText(ROUTINE);
    await expect(p.getByTestId("day-today")).toContainText(ROUTINE);
    await tile.getByRole("button", { name: `„${ROUTINE}“ heute abhaken` }).click();
    await expect(tile.getByRole("button", { name: `„${ROUTINE}“ wieder öffnen` })).toBeVisible();

    // Ben (same family) sees it too; Clara's family never does
    await sessions.ben!.goto("/routinen");
    await expect(sessions.ben!.getByTestId("routine-row").filter({ hasText: ROUTINE })).toBeVisible();
  });

  test("Clara (andere Familie) sieht nichts davon", async () => {
    const p = sessions.clara!;
    // Her own data exists, so that "sees nothing" cannot be an empty-page accident.
    await p.goto("/aufgaben");
    await p.getByLabel("Was ist zu tun?").fill(FOREIGN_TASK);
    await p.getByRole("button", { name: "Aufgabe anlegen" }).click();
    for (const path of ["/", "/aufgaben", "/geburtstage", "/routinen"]) {
      await p.goto(path);
      const body = p.locator("body");
      await expect(body).not.toContainText(ROUTINE);
      await expect(body).not.toContainText(TASK);
      await expect(body).not.toContainText(BIRTHDAY);
      await expect(body).not.toContainText("Anna Muster");
    }
    await p.goto("/aufgaben");
    await expect(p.locator("body")).toContainText(FOREIGN_TASK);
    // ... and the other way round.
    await sessions.anna!.goto("/aufgaben");
    await expect(sessions.anna!.locator("body")).not.toContainText(FOREIGN_TASK);
  });

  test("Ansicht bei 375 px ohne horizontalen Überlauf, mit Tab-Leiste", async ({ browser }) => {
    const ctx = await browser.newContext({
      viewport: { width: 375, height: 812 },
      storageState: await sessions.anna!.context().storageState(),
    });
    const p = await ctx.newPage();
    for (const path of ["/", "/aufgaben", "/routinen", "/routinen/neu", "/geburtstage", "/familie/mitglieder", "/kalender", "/kalender?ansicht=monat", "/kalender/quellen", "/kalender/termin/neu", "/rezepte", "/rezepte/neu", "/essen", "/essen/idee", "/einkauf", "/einkauf/geschaefte", "/konto"]) {
      await p.goto(path);
      await expect(p.locator("main")).toBeVisible();
      const { scroll, client } = await p.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        client: document.documentElement.clientWidth,
      }));
      expect(scroll, `${path}: scrollWidth ${scroll} > clientWidth ${client}`).toBeLessThanOrEqual(client);
    }
    await p.goto("/");
    const tabs = p.getByRole("navigation", { name: "Hauptmenü" }).last();
    await expect(tabs).toBeVisible();
    await expect(tabs.getByRole("link")).toHaveCount(7);
    await expect(p.getByTestId("day-today")).toContainText(TASK);
    await p.screenshot({ path: "test-results/dashboard-375.png", fullPage: true });
    await ctx.close();
  });

  test("Desktop zeigt die Seitenleiste statt der Tab-Leiste", async () => {
    const p = sessions.anna!;
    await p.goto("/");
    await expect(p.locator("aside nav")).toBeVisible();
    await expect(p.locator("nav.fixed")).toBeHidden();
    await p.screenshot({ path: "test-results/dashboard-desktop.png", fullPage: true });
  });

  test("PWA-Manifest, Icons, Service Worker und Security-Header", async ({ request }) => {
    const m = await request.get("/manifest.webmanifest");
    expect(m.ok()).toBe(true);
    const manifest = await m.json();
    expect(manifest.display).toBe("standalone");
    expect(manifest.icons.map((i: { sizes: string }) => i.sizes)).toEqual(expect.arrayContaining(["192x192", "512x512"]));
    for (const i of manifest.icons) expect((await request.get(i.src)).ok()).toBe(true);
    expect((await request.get("/apple-touch-icon.png")).ok()).toBe(true);
    const sw = await request.get("/sw.js");
    expect(sw.ok()).toBe(true);
    expect(await sw.text()).not.toMatch(/cache\.(put|add)|addEventListener\("fetch"/);

    const r = await request.get("/anmelden");
    const h = r.headers();
    expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(h["content-security-policy"]).toContain("object-src 'none'");
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["referrer-policy"]).toBeTruthy();
    expect(h["x-powered-by"]).toBeUndefined();
    // the version is visible without signing in, so a deployment can be checked from outside
    const { version } = JSON.parse(readFileSync("package.json", "utf8")) as { version: string };
    expect(await r.text()).toContain(`Plan4JU ${version}`);
  });

  test("Ohne Anmeldung kein Zugriff auf das Dashboard", async ({ browser }) => {
    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    await p.goto("/");
    await expect(p).toHaveURL(/\/anmelden/);
    await ctx.close();
  });
});
