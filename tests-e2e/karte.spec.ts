import { randomBytes } from "node:crypto";
import { hash } from "@node-rs/argon2";
import { PrismaClient } from "@prisma/client";
import { expect, test, type Browser, type Page } from "@playwright/test";

// Karte: Anna sets a point by tapping the map, Ben sees it and filters; a past event lands in the archive.
// Users are created directly with a password (no sign-up). Tile requests are aborted (no load on OSM).
const run = randomBytes(4).toString("hex");
const admin = new PrismaClient({ datasourceUrl: process.env.DATABASE_ADMIN_URL });
const secret = () => randomBytes(12).toString("base64url");
const anna = { name: "Anna Muster", email: `anna-k-${run}@example.test`, phrase: secret() };
const ben = { name: "Ben Muster", email: `ben-k-${run}@example.test`, phrase: secret() };
let familyA = "";
let familyB = "";

async function noOverflow(p: Page) {
  const { scroll, client } = await p.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  expect(scroll, `${p.url()}: ${scroll} > ${client}`).toBeLessThanOrEqual(client);
}

async function signIn(browser: Browser, who: { email: string; phrase: string }): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
  await ctx.route(/tile\.openstreetmap\.org/, (r) => r.abort());
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

test.describe.serial("Karte", () => {
  let a: Page;
  let b: Page;

  test.beforeAll(async ({ browser }) => {
    familyA = (await admin.family.create({ data: { name: "Familie Muster" } })).id;
    familyB = (await admin.family.create({ data: { name: "Familie Beispiel" } })).id;
    const catB = await admin.mapCategory.create({ data: { familyId: familyB, name: "Fremd", icon: "pin" } });
    await admin.poi.create({ data: { familyId: familyB, categoryId: catB.id, name: `Fremder Ort ${run}`, lat: 50, lng: 8, createdById: "niemand" } });
    for (const [key, who, role] of [["anna", anna, "OWNER"], ["ben", ben, "MEMBER"]] as const) {
      const u = await admin.user.create({ data: { id: `${key}-k-${run}`, name: who.name, email: who.email, emailVerified: true } });
      await admin.account.create({
        data: { id: `acc-${key}-k-${run}`, accountId: u.id, providerId: "credential", userId: u.id, password: await hash(who.phrase, { memoryCost: 19456, timeCost: 2, parallelism: 1 }) },
      });
      await admin.familyMembership.create({ data: { familyId: familyA, userId: u.id, role } });
      await admin.familyProfile.create({ data: { familyId: familyA, displayName: who.name, userId: u.id } });
    }
    a = await signIn(browser, anna);
    b = await signIn(browser, ben);
  });

  test.afterAll(async () => {
    await admin.family.deleteMany({ where: { id: { in: [familyA, familyB] } } });
    await admin.user.deleteMany({ where: { id: { in: [`anna-k-${run}`, `ben-k-${run}`] } } });
    await admin.$disconnect();
  });

  test("Anna adds a playground by tapping the map", async () => {
    await a.goto("/karte");
    await expect(a.getByRole("heading", { name: "Karte" })).toBeVisible();
    await expect(a.getByRole("navigation", { name: "Unterseiten" }).getByRole("link", { name: "Karte" })).toHaveAttribute("aria-current", "page");
    await expect(a.getByText(`Fremder Ort ${run}`)).toHaveCount(0);
    await noOverflow(a);
    const map = a.getByTestId("karte");
    await expect(map.locator(".leaflet-control-attribution")).toContainText("OpenStreetMap");
    await map.click({ position: { x: 150, y: 120 } });
    await expect(a.locator("#neu-lat")).not.toHaveValue("");
    await a.getByLabel("Name", { exact: true }).fill("Spielplatz am Bach");
    await a.locator("select[name=categoryId]").selectOption({ label: "Spielplatz" });
    await a.getByLabel("Bewertung (optional)").selectOption("4");
    await a.getByRole("button", { name: "Ort speichern" }).click();
    await expect(a.getByRole("heading", { name: "Spielplatz am Bach" })).toBeVisible();
    await expect(a.getByText("Ort gespeichert.")).toBeVisible();
    await noOverflow(a);
  });

  test("Ben sees it, filters, cannot edit; a past event is archived", async () => {
    const cafe = await admin.mapCategory.findFirstOrThrow({ where: { familyId: familyA, name: "Café" } });
    const fest = await admin.mapCategory.findFirstOrThrow({ where: { familyId: familyA, name: "Fest" } });
    await admin.poi.create({ data: { familyId: familyA, categoryId: cafe.id, name: "Eiscafé Muster", lat: 50.2, lng: 8.7, createdById: `ben-k-${run}` } });
    await admin.poi.create({
      data: { familyId: familyA, categoryId: fest.id, name: "Altes Fest", lat: 50.3, lng: 8.8, startDate: new Date("2020-06-01"), endDate: new Date("2020-06-02"), createdById: `ben-k-${run}` },
    });
    await b.goto("/karte");
    const rows = b.getByTestId("poi-row");
    await expect(rows).toHaveCount(2);
    await expect(rows.filter({ hasText: "Altes Fest" })).toHaveCount(0);
    await b.locator("#f-von").selectOption({ label: "Ben Muster" });
    await b.getByRole("button", { name: "Filtern" }).click();
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText("Eiscafé Muster");
    await b.goto("/karte");
    await b.locator("#f-kat").selectOption({ label: "Spielplatz" });
    await b.getByRole("button", { name: "Filtern" }).click();
    await expect(rows).toHaveCount(1);
    await rows.first().getByRole("link").click();
    await expect(b.getByRole("heading", { name: "Spielplatz am Bach" })).toBeVisible();
    await expect(b.getByText("Anna Muster", { exact: false })).toBeVisible();
    await expect(b.getByRole("button", { name: "Speichern" })).toHaveCount(0);
    await b.goto("/karte?archiv=1");
    await expect(b.getByTestId("poi-row")).toHaveCount(1);
    await expect(b.getByTestId("poi-row").first()).toContainText("Altes Fest");
    await noOverflow(b);
    await b.goto("/karte/kategorien");
    await expect(b.getByText("Kategorien verwalten nur Admins der Familie.")).toBeVisible();
    await expect(b.getByTestId("category-row")).toHaveCount(8);
  });
});
