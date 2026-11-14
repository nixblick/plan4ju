import { randomBytes } from "node:crypto";
import { hash } from "@node-rs/argon2";
import { PrismaClient } from "@prisma/client";
import { expect, test, type Browser, type Page } from "@playwright/test";

// Abnahme 0.3: a recipe is planned, chosen ingredients land traceably on the shopping list.
// Anna and Ben are created directly with a password and sign in (no sign-up: the full E2E run is
// close to the sign-up limit of 5 per minute). Familie Beispiel's entry must stay invisible.
const run = randomBytes(4).toString("hex");
const admin = new PrismaClient({ datasourceUrl: process.env.DATABASE_ADMIN_URL });
const secret = () => randomBytes(12).toString("base64url");
const anna = { name: "Anna Muster", email: `anna-e-${run}@example.test`, phrase: secret() };
const ben = { name: "Ben Muster", email: `ben-e-${run}@example.test`, phrase: secret() };
const TITLE = `Gemüsecurry ${run}`;
const pages: Record<string, Page> = {};
let foreignShopId = "";
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
  // no active family yet: no feedback button (it would have nowhere to store)
  await expect(p.getByRole("button", { name: /Feedback/ })).toHaveCount(0);
  await p.getByRole("button", { name: "Öffnen" }).click();
  await expect(p.getByTestId("week")).toBeVisible();
  await expect(p.getByRole("button", { name: /Feedback/ }).first()).toBeVisible();
  return p;
}

test.describe.serial("Einkaufsliste", () => {
  test.beforeAll(async ({ browser }) => {
    const fa = await admin.family.create({ data: { name: "Familie Muster" } });
    const fb = await admin.family.create({ data: { name: "Familie Beispiel" } });
    familyA = fa.id;
    foreignShopId = (await admin.shop.create({ data: { familyId: fb.id, name: `Fremder Laden ${run}`, position: 0 } })).id;
    await admin.shoppingItem.create({ data: { familyId: fb.id, name: `Fremder Einkauf ${run}`, fromRecipes: [], createdById: "niemand" } });
    for (const [key, who, role] of [["anna", anna, "OWNER"], ["ben", ben, "MEMBER"]] as const) {
      const u = await admin.user.create({ data: { id: `${key}-${run}`, name: who.name, email: who.email, emailVerified: true } });
      await admin.account.create({
        data: { id: `acc-${key}-${run}`, accountId: u.id, providerId: "credential", userId: u.id, password: await hash(who.phrase, { memoryCost: 19456, timeCost: 2, parallelism: 1 }) },
      });
      await admin.familyMembership.create({ data: { familyId: familyA, userId: u.id, role } });
      await admin.familyProfile.create({ data: { familyId: familyA, displayName: who.name, userId: u.id } });
    }
    pages.anna = await signIn(browser, anna);
  });

  test.afterAll(async () => {
    await admin.family.deleteMany({ where: { id: familyA } });
    await admin.$disconnect();
  });

  test("Rezept planen, ausgewählte Zutaten übertragen, Herkunft sichtbar (375 px)", async () => {
    const p = pages.anna!;
    await p.goto("/rezepte/neu");
    const form = p.locator("form").filter({ has: p.getByRole("button", { name: "Rezept speichern" }) });
    await form.getByLabel("Titel").fill(TITLE);
    await form.getByLabel("Portionen").fill("2");
    const rows: [string, string, string][] = [["400", "g", "Kichererbsen"], ["1", "Dose", "Kokosmilch"], ["", "", "Salz"]];
    for (const [n, [q, u, name]] of rows.entries()) {
      if (n > 0) await form.getByRole("button", { name: "Zutat hinzufügen" }).click();
      if (q) await form.getByLabel(`Menge ${n + 1}`, { exact: true }).fill(q);
      if (u) await form.getByLabel(`Einheit ${n + 1}`, { exact: true }).fill(u);
      await form.getByLabel(`Zutat ${n + 1}`, { exact: true }).fill(name);
    }
    await form.getByRole("button", { name: "Rezept speichern" }).click();
    await expect(p.getByRole("heading", { name: TITLE })).toBeVisible();

    // plan it for today
    await p.goto("/essen");
    const abend = p.getByTestId("meal-day-today").getByTestId("meal-slot").nth(2);
    await abend.locator("summary").click();
    await abend.getByLabel("Rezept").selectOption({ label: TITLE });
    await abend.getByRole("button", { name: "Planen" }).click();
    await expect(p.getByRole("status")).toContainText("Essen geplant");

    // from the planned meal to the preview
    await abend.locator("summary").click();
    await p.getByTestId("meal-day-today").getByRole("link", { name: "Zutaten einkaufen" }).click();
    await expect(p.getByRole("heading", { name: `Zutaten einkaufen: ${TITLE}` })).toBeVisible();
    await expect(p.getByTestId("transfer-row")).toHaveCount(3);
    await noOverflow(p);
    await p.getByRole("checkbox", { name: "Salz" }).uncheck();
    await p.getByLabel("Menge 1").fill("800");
    await p.getByLabel("Geschäft 2").selectOption({ label: "Drogerie" });
    await p.getByRole("button", { name: "Ausgewählte auf die Einkaufsliste" }).click();

    await expect(p.getByRole("status")).toContainText("Zutaten auf die Einkaufsliste übertragen");
    await expect(p.getByTestId("item-name")).toHaveText(["Kichererbsen", "Kokosmilch"]);
    const kicher = p.getByTestId("open-item").filter({ hasText: "Kichererbsen" });
    await expect(kicher).toContainText("800 g");
    await expect(kicher).toContainText(`aus Rezept „${TITLE}“`);
    await expect(p.getByTestId("open-item").filter({ hasText: "Kokosmilch" })).toContainText("Drogerie");
    await noOverflow(p);

    // a second transfer merges instead of duplicating
    await p.goto("/essen");
    await abend.locator("summary").click();
    await p.getByTestId("meal-day-today").getByRole("link", { name: "Zutaten einkaufen" }).click();
    await p.getByRole("checkbox", { name: "Kokosmilch" }).uncheck();
    await p.getByRole("checkbox", { name: "Salz" }).uncheck();
    await p.getByRole("button", { name: "Ausgewählte auf die Einkaufsliste" }).click();
    await expect(p.getByTestId("item-name")).toHaveText(["Kichererbsen", "Kokosmilch"]);
    await expect(p.getByTestId("open-item").filter({ hasText: "Kichererbsen" })).toContainText("1200 g");
  });

  test("eigener Eintrag, Filter je Geschäft, abhaken, wegräumen, wiederherstellen", async () => {
    const p = pages.anna!;
    await p.goto("/einkauf");
    await p.getByText("+ Eintrag hinzufügen").click();
    const add = p.locator("form").filter({ has: p.getByRole("button", { name: "Auf die Liste" }) });
    await add.getByLabel("Artikel").fill("Zahnpasta");
    await add.getByLabel("Notiz").fill("die milde");
    await add.getByRole("checkbox", { name: "Drogerie" }).check();
    await add.getByRole("button", { name: "Auf die Liste" }).click();
    await expect(p.getByRole("status")).toContainText("Auf die Einkaufsliste gesetzt");

    await p.getByRole("link", { name: "Drogerie" }).click();
    await expect(p.getByTestId("item-name")).toHaveText(["Kokosmilch", "Zahnpasta"]);
    await noOverflow(p);
    await p.getByRole("link", { name: "Alle" }).click();

    await p.getByRole("button", { name: "Zahnpasta abhaken" }).click();
    await expect(p.getByTestId("done-item")).toContainText("Zahnpasta");
    await p.getByRole("button", { name: "Erledigte wegräumen" }).click();
    await expect(p.getByTestId("done-item")).toHaveCount(0);
    await p.getByText(/^Weggeräumt/).click();
    await p.getByRole("button", { name: "Zahnpasta wiederherstellen" }).click();
    await expect(p.getByTestId("open-item").filter({ hasText: "Zahnpasta" })).toBeVisible();
    await noOverflow(p);
  });

  test("zweites Mitglied sieht die Liste, die andere Familie nicht", async ({ browser }) => {
    const b = await signIn(browser, ben);
    await b.goto("/einkauf");
    await expect(b.getByTestId("item-name")).toHaveText(["Kichererbsen", "Kokosmilch", "Zahnpasta"]);
    await expect(b.getByTestId("open-item").filter({ hasText: "Kichererbsen" })).toContainText(`aus Rezept „${TITLE}“`);
    await expect(b.locator("main")).not.toContainText("Fremder Einkauf");
    await noOverflow(b);

    // Ben ticks off, Anna sees it after "Aktualisieren"
    await b.getByRole("button", { name: "Kokosmilch abhaken" }).click();
    await expect(b.getByTestId("done-item")).toContainText("Kokosmilch");
    const a = pages.anna!;
    await a.goto("/einkauf");
    await a.getByRole("button", { name: "Aktualisieren" }).click();
    await expect(a.getByTestId("done-item")).toContainText("Kokosmilch");
    // a foreign shop id in the address shows the own, unfiltered list
    await a.goto(`/einkauf?laden=${foreignShopId}`);
    await expect(a.locator("main")).not.toContainText("Fremder Einkauf");
  });

  test("Konto: Seite erreichbar, Kennwort ändern prüft das aktuelle (375 px)", async () => {
    const p = pages.anna!;
    await p.getByRole("banner").getByRole("link", { name: "Konto" }).click();
    await expect(p.getByRole("heading", { name: "Konto", exact: true })).toBeVisible();
    await noOverflow(p);
    await p.getByLabel("Aktuelles Kennwort").fill("ganz-falsch-123");
    await p.getByLabel(/^Neues Kennwort \(/).fill("neues-kennwort-123");
    await p.getByLabel("Neues Kennwort wiederholen").fill("neues-kennwort-123");
    await p.getByRole("button", { name: "Kennwort ändern" }).click();
    await expect(p.locator("main").getByRole("alert")).toContainText("Das aktuelle Kennwort stimmt nicht");

    await p.getByLabel("Aktuelles Kennwort").fill(anna.phrase);
    await p.getByLabel(/^Neues Kennwort \(/).fill("neues-kennwort-123");
    await p.getByLabel("Neues Kennwort wiederholen").fill("neues-kennwort-123");
    await p.getByRole("button", { name: "Kennwort ändern" }).click();
    await expect(p.getByRole("status")).toContainText("Kennwort geändert");
    await p.goto("/einkauf");
    await expect(p.getByRole("heading", { name: "Einkaufsliste" })).toBeVisible();

    await p.goto("/konto");
    await p.getByRole("button", { name: "Überall abmelden" }).click();
    await expect(p).toHaveURL(/\/anmelden/);
    await expect(p.getByRole("status")).toContainText("auf allen Geräten abgemeldet");
    await p.goto("/einkauf");
    await expect(p).toHaveURL(/\/anmelden/);
  });
});
