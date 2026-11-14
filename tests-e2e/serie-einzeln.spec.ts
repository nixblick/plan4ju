import { randomBytes } from "node:crypto";
import { hash } from "@node-rs/argon2";
import { PrismaClient } from "@prisma/client";
import { expect, test, type Page } from "@playwright/test";

// One instance of a series: move a calendar event and a routine occurrence at 375 px.
const run = randomBytes(4).toString("hex");
const email = `anna-se-${run}@example.test`;
const phrase = randomBytes(12).toString("base64url"); // generated at run time, never stored
const admin = new PrismaClient({ datasourceUrl: process.env.DATABASE_ADMIN_URL });
let familyId = "";
let page: Page;

const berlinToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(new Date());
const plus = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

test.describe.serial("Einzelne Termine einer Serie", () => {
  test.beforeAll(async ({ browser }) => {
    familyId = (await admin.family.create({ data: { name: `Familie Muster ${run}`, timezone: "Europe/Berlin" } })).id;
    const u = await admin.user.create({ data: { id: `anna-se-${run}`, name: "Anna Muster", email, emailVerified: true } });
    await admin.account.create({
      data: { id: `acc-anna-se-${run}`, accountId: u.id, providerId: "credential", userId: u.id, password: await hash(phrase, { memoryCost: 19456, timeCost: 2, parallelism: 1 }) },
    });
    await admin.familyMembership.create({ data: { familyId, userId: u.id, role: "OWNER" } });
    const profile = await admin.familyProfile.create({ data: { familyId, displayName: "Anna Muster", userId: u.id } });
    // Weekly on Monday 18:00 (winter time), from 04.01.2027.
    await admin.calendarEvent.create({
      data: {
        familyId, createdById: u.id, title: `Chor ${run}`, startsAt: new Date("2027-01-04T17:00:00Z"), endsAt: new Date("2027-01-04T18:00:00Z"),
        freq: "WEEKLY", weekdays: [0],
      },
    });
    const today = berlinToday();
    await admin.routine.create({
      data: { familyId, createdById: u.id, title: `Gießen ${run}`, freq: "DAILY", startDate: new Date(`${today}T00:00:00Z`), endDate: new Date(`${today}T00:00:00Z`), timeOfDay: "07:00",
        assignments: { create: [{ profileId: profile.id, familyId }] } } });

    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
    page = await ctx.newPage();
    await page.goto("/anmelden");
    await page.getByLabel("E-Mail-Adresse").fill(email);
    await page.getByLabel("Kennwort").fill(phrase);
    await page.getByRole("button", { name: /Anmelden/ }).click();
    await expect(page.getByRole("heading", { name: "Familie wählen" })).toBeVisible();
    await page.getByRole("button", { name: "Öffnen" }).click();
    await expect(page.getByTestId("week")).toBeVisible();
  });

  test.afterAll(async () => {
    await page?.context().close();
    await admin.family.deleteMany({ where: { id: familyId } });
    await admin.user.deleteMany({ where: { email } });
    await admin.$disconnect();
  });

  test("Einen Termin der Serie verschieben, die übrigen bleiben", async () => {
    await page.goto("/kalender?ansicht=woche&datum=2027-01-11&tag=2027-01-11");
    await page.getByRole("link", { name: `Chor ${run}` }).first().click();
    await expect(page).toHaveURL(/\/kalender\/termin\/[^/]+\/2027-01-11$/);
    await expect(page.getByTestId("instance-state")).toHaveText("Wie in der Serie: 11.01.2027, 18:00 Uhr.");
    await page.getByLabel("Neuer Tag").fill("2027-01-13");
    await page.getByLabel("Beginn").fill("19:00");
    await page.getByLabel("Ende").fill("20:30");
    await page.getByRole("button", { name: "Nur diesen Termin verschieben" }).click();
    await expect(page.getByTestId("instance-state")).toHaveText("Verschoben auf 13.01.2027, 19:00 Uhr.");

    await page.goto("/kalender?ansicht=woche&datum=2027-01-11&tag=2027-01-13");
    await expect(page.getByTestId("cal-item-moved")).toHaveText("verschoben vom 11.01.");
    await page.goto("/kalender?ansicht=woche&datum=2027-01-11&tag=2027-01-11");
    // The week lists only the moved instance, no longer the one at 18:00.
    await expect(page.getByRole("link", { name: `Chor ${run}` })).toHaveCount(1);
    await expect(page.getByText("18:00–19:00 Uhr")).toHaveCount(0);
    await page.goto("/kalender?ansicht=woche&datum=2027-01-18&tag=2027-01-18");
    await expect(page.getByRole("link", { name: `Chor ${run}` })).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  });

  test("Einen Termin absagen und wiederherstellen", async () => {
    await page.goto("/kalender?ansicht=woche&datum=2027-01-18&tag=2027-01-18");
    await page.getByRole("link", { name: `Chor ${run}` }).click();
    await page.getByRole("button", { name: "Nur diesen Termin absagen" }).click();
    await expect(page.getByTestId("instance-state")).toHaveText("Abgesagt.");
    await page.getByRole("button", { name: "Wie in der Serie" }).click();
    await expect(page.getByTestId("instance-state")).toHaveText("Wie in der Serie: 18.01.2027, 18:00 Uhr.");
  });

  test("Eine Routine auf morgen verschieben", async () => {
    const tomorrow = plus(berlinToday(), 1);
    await page.goto("/routinen");
    const row = page.getByTestId("occurrence-row").filter({ hasText: `Gießen ${run}` });
    await row.getByText("Verschieben", { exact: true }).click();
    await row.getByLabel("Tag", { exact: true }).fill(tomorrow);
    await row.getByLabel("Uhrzeit").fill("18:30");
    await row.getByRole("button", { name: "Nur diesen verschieben" }).click();
    const moved = page.getByTestId("occurrence-row").filter({ hasText: `Gießen ${run}` });
    await expect(moved.getByTestId("occurrence-moved")).toContainText("verschoben vom");
    await expect(moved).toContainText("18:30 Uhr");
  });
});
