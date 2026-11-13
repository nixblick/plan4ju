import { randomBytes } from "node:crypto";
import { hash } from "@node-rs/argon2";
import { PrismaClient } from "@prisma/client";
import { expect, test, type Browser, type Page } from "@playwright/test";

// Zusatzmodule: off by default, only admins switch, a switched-off module page is 404. Regression in CI
// (the full story runs in abnahme-0.5.spec.ts against the container). Users without sign-up.
const run = randomBytes(4).toString("hex");
const admin = new PrismaClient({ datasourceUrl: process.env.DATABASE_ADMIN_URL });
const secret = () => randomBytes(12).toString("base64url");
const anna = { name: "Anna Muster", email: `anna-mo-${run}@example.test`, phrase: secret() };
const ben = { name: "Ben Muster", email: `ben-mo-${run}@example.test`, phrase: secret() };
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

test.describe.serial("Zusatzmodule", () => {
  test.beforeAll(async () => {
    familyA = (await admin.family.create({ data: { name: "Familie Muster" } })).id;
    for (const [key, who, role] of [["anna", anna, "OWNER"], ["ben", ben, "MEMBER"]] as const) {
      const u = await admin.user.create({ data: { id: `${key}-mo-${run}`, name: who.name, email: who.email, emailVerified: true } });
      await admin.account.create({
        data: { id: `acc-${key}-mo-${run}`, accountId: u.id, providerId: "credential", userId: u.id, password: await hash(who.phrase, { memoryCost: 19456, timeCost: 2, parallelism: 1 }) },
      });
      await admin.familyMembership.create({ data: { familyId: familyA, userId: u.id, role } });
      await admin.familyProfile.create({ data: { familyId: familyA, displayName: who.name, userId: u.id } });
    }
  });

  test.afterAll(async () => {
    await admin.family.deleteMany({ where: { id: familyA } });
    await admin.user.deleteMany({ where: { id: { in: [`anna-mo-${run}`, `ben-mo-${run}`] } } });
    await admin.$disconnect();
  });

  test("Anna schaltet Prospekte ein und aus, Ben sieht keine Schalter", async ({ browser }) => {
    const b = await signIn(browser, ben);
    expect((await b.goto("/einkauf/prospekte"))?.status()).toBe(404);
    await b.goto("/familie/mitglieder");
    await b.getByRole("navigation", { name: "Bereiche der Familie" }).getByRole("link", { name: "Module" }).click();
    await expect(b.getByRole("heading", { name: "Module", exact: true })).toBeVisible();
    await expect(b.getByRole("button", { name: /einschalten/ })).toHaveCount(0);
    await noOverflow(b);

    const a = await signIn(browser, anna);
    await a.goto("/familie/module");
    await a.getByRole("button", { name: "Prospekte einschalten" }).click();
    await expect(a.getByRole("status")).toHaveText("Modul eingeschaltet.");
    await noOverflow(a);
    await b.goto("/einkauf/prospekte");
    await expect(b.getByTestId("flyer-link")).toHaveCount(5);
    expect((await b.goto("/kalender/abfall"))?.status()).toBe(404);

    await a.getByRole("button", { name: "Prospekte ausschalten" }).click();
    await expect(a.getByRole("status")).toHaveText("Modul ausgeschaltet.");
    expect((await b.goto("/einkauf/prospekte"))?.status()).toBe(404);
    await a.context().close();
    await b.context().close();
  });

  test("Anna schaltet Karte, Wunschzettel, Achtsamkeit und Essen aus: weg aus Navigation und Startseite, Einkauf bleibt", async ({ browser }) => {
    const a = await signIn(browser, anna);
    await a.goto("/familie/module");
    for (const label of ["Karte", "Wunschzettel", "Achtsamkeit", "Essen und Rezepte"]) {
      await a.getByRole("button", { name: `${label} ausschalten` }).click();
      await expect(a.getByRole("status")).toHaveText("Modul ausgeschaltet.");
    }
    for (const path of ["/karte", "/wuensche", "/achtsamkeit", "/essen", "/rezepte"]) expect((await a.goto(path))?.status()).toBe(404);
    await a.goto("/");
    await expect(a.getByRole("region", { name: "Essen heute" })).toHaveCount(0);
    await a.goto("/geburtstage");
    await expect(a.getByRole("navigation", { name: "Unterseiten" })).toHaveCount(0);
    await a.goto("/einkauf");
    await expect(a.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(a.getByRole("link", { name: "Einkauf" }).first()).toBeVisible();
    await expect(a.getByRole("navigation", { name: "Essen" })).toHaveCount(0);
    await noOverflow(a);

    await a.goto("/familie/module");
    for (const label of ["Karte", "Wunschzettel", "Achtsamkeit", "Essen und Rezepte"]) {
      await a.getByRole("button", { name: `${label} einschalten` }).click();
      await expect(a.getByRole("status")).toHaveText("Modul eingeschaltet.");
    }
    expect((await a.goto("/karte"))?.status()).toBe(200);
    await a.context().close();
  });
});
