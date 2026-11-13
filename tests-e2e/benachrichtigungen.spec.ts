import { randomBytes } from "node:crypto";
import { hash } from "@node-rs/argon2";
import { PrismaClient } from "@prisma/client";
import { expect, test, type Browser, type Page } from "@playwright/test";

// Benachrichtigungen: bell, list, settings and the private calendar feed at 375 px. Users without sign-up.
// 
const run = randomBytes(4).toString("hex");
const admin = new PrismaClient({ datasourceUrl: process.env.DATABASE_ADMIN_URL });
const secret = () => randomBytes(12).toString("base64url");
const anna = { name: "Anna Muster", email: `anna-nb-${run}@example.test`, phrase: secret() };
const ben = { name: "Ben Muster", email: `ben-nb-${run}@example.test`, phrase: secret() };
let familyA = "";

async function noOverflow(p: Page) {
  const { scroll, client } = await p.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  expect(scroll, `${p.url()}: ${scroll} > ${client}`).toBeLessThanOrEqual(client);
}

async function signIn(browser: Browser, who: { email: string; phrase: string }): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const p = await ctx.newPage();
  await p.goto("/anmelden");
  await p.getByLabel("E-Mail-Adresse").fill(who.email);
  await p.getByLabel("Kennwort").fill(who.phrase);
  await p.getByRole("button", { name: /Anmelden/ }).click();
  await expect(p.getByRole("heading", { name: "Familie wählen" })).toBeVisible();
  await p.getByRole("button", { name: "Öffnen" }).click();
  await expect(p.getByTestId("week")).toBeVisible();
  return p;
}

const berlinDay = (offset: number) => new Date(Date.now() + offset * 86_400_000).toLocaleDateString("en-CA", { timeZone: "Europe/Berlin" });
let taskId = "";

test.describe.serial("Benachrichtigungen", () => {
  test.beforeAll(async () => {
    familyA = (await admin.family.create({ data: { name: "Familie Muster" } })).id;
    const profiles: Record<string, string> = {};
    for (const [key, who, role] of [["anna", anna, "OWNER"], ["ben", ben, "MEMBER"]] as const) {
      const u = await admin.user.create({ data: { id: `${key}-nb-${run}`, name: who.name, email: who.email, emailVerified: true } });
      await admin.account.create({
        data: { id: `acc-${key}-nb-${run}`, accountId: u.id, providerId: "credential", userId: u.id, password: await hash(who.phrase, { memoryCost: 19456, timeCost: 2, parallelism: 1 }) },
      });
      await admin.familyMembership.create({ data: { familyId: familyA, userId: u.id, role } });
      profiles[key] = (await admin.familyProfile.create({ data: { familyId: familyA, displayName: who.name, userId: u.id } })).id;
    }
    const today = berlinDay(0);
    taskId = (await admin.task.create({
      data: { familyId: familyA, title: "Fahrrad flicken", dueDate: new Date(`${today}T00:00:00Z`), createdById: `anna-nb-${run}`, assignments: { create: { profileId: profiles.ben!, familyId: familyA } } },
    })).id;
    const [, m, d] = berlinDay(1).split("-").map(Number) as [number, number, number];
    await admin.birthday.create({ data: { familyId: familyA, name: "Opa Muster", month: m, day: d, createdById: `anna-nb-${run}` } });
    await admin.calendarEvent.create({
      data: { familyId: familyA, title: "Laternenumzug", allDay: true, startDate: new Date(`${berlinDay(3)}T00:00:00Z`), endDate: new Date(`${berlinDay(3)}T00:00:00Z`), createdById: `anna-nb-${run}` },
    });
  });

  test.afterAll(async () => {
    await admin.family.deleteMany({ where: { id: familyA } });
    await admin.user.deleteMany({ where: { id: { in: [`anna-nb-${run}`, `ben-nb-${run}`] } } });
    await admin.$disconnect();
  });

  test("bell counts, list opens the task, all read", async ({ browser }) => {
    const p = await signIn(browser, ben);
    // Fällig heute, neu zugewiesen, Geburtstag morgen.
    await expect(p.locator("[data-testid=bell-count]:visible")).toHaveText("3");
    await noOverflow(p);
    await p.getByRole("link", { name: /Benachrichtigungen, 3 ungelesen/ }).click();
    await expect(p.getByRole("heading", { name: "Benachrichtigungen" })).toBeVisible();
    await expect(p.getByText("Morgen hat Opa Muster Geburtstag")).toBeVisible();
    await noOverflow(p);
    await p.getByRole("button", { name: /Heute fällig: Fahrrad flicken/ }).click();
    await expect(p).toHaveURL(new RegExp(`/aufgaben/${taskId}`));
    await expect(p.locator("[data-testid=bell-count]:visible")).toHaveText("2");
    await p.goto("/benachrichtigungen");
    await p.getByRole("button", { name: "Alle als gelesen markieren" }).click();
    await expect(p.getByText("Alle Benachrichtigungen als gelesen markiert.")).toBeVisible();
    await expect(p.locator("[data-testid=bell-count]:visible")).toHaveCount(0);
    // Anna (Owner) sees none of Ben's notifications.
    const a = await signIn(browser, anna);
    await a.goto("/benachrichtigungen");
    await expect(a.getByText("Fahrrad flicken")).toHaveCount(0);
    await a.context().close();
    await p.context().close();
  });

  test("settings and private calendar feed", async ({ browser, request }) => {
    const p = await signIn(browser, ben);
    await p.goto("/benachrichtigungen/einstellungen");
    await noOverflow(p);
    await expect(p.getByLabel(/Tägliche E-Mail-Zusammenfassung/)).not.toBeChecked();
    await p.getByLabel(/Geburtstage/).uncheck();
    await p.getByRole("button", { name: "Speichern" }).click();
    await expect(p.getByText("Einstellungen gespeichert.")).toBeVisible();
    await expect(p.getByLabel(/Geburtstage/)).not.toBeChecked();

    await p.getByRole("button", { name: "Kalender-Link erzeugen" }).click();
    const url = await p.getByLabel("Kalender-Link").inputValue();
    expect(url).toMatch(/\/api\/kalender\/feed\/[A-Za-z0-9_-]{43}\.ics$/);
    await noOverflow(p);
    const path = new URL(url).pathname;
    const res = await request.get(path);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("text/calendar");
    const body = await res.text();
    expect(body).toContain("SUMMARY:Laternenumzug");
    expect(body).toContain("SUMMARY:Geburtstag: Opa Muster");
    expect((await request.get(path.replace(/.{5}\.ics$/, "AAAAA.ics"))).status()).toBe(404);

    await p.reload();
    await expect(p.getByTestId("feed-status")).toContainText("zuletzt abgerufen");
    await p.getByRole("button", { name: "Link widerrufen" }).click();
    await expect(p.getByText(/Kalender-Link widerrufen/)).toBeVisible();
    expect((await request.get(path)).status()).toBe(404);
    // Job endpoint without a configured token is not there.
    expect((await request.post("/api/jobs/digest")).status()).toBe(404);
    await p.context().close();
  });
});
