import { randomBytes } from "node:crypto";
import { hash } from "@node-rs/argon2";
import { PrismaClient } from "@prisma/client";
import { expect, test, type Browser, type Page } from "@playwright/test";

// Wunschzettel: Anna writes her list, Ben reserves a wish, Anna must not notice (surprise mode).
// Users are created directly with a password (no sign-up, see einkauf.spec.ts). Familie Beispiel stays invisible.
const run = randomBytes(4).toString("hex");
const admin = new PrismaClient({ datasourceUrl: process.env.DATABASE_ADMIN_URL });
const secret = () => randomBytes(12).toString("base64url");
const anna = { name: "Anna Muster", email: `anna-w-${run}@example.test`, phrase: secret() };
const ben = { name: "Ben Muster", email: `ben-w-${run}@example.test`, phrase: secret() };
const LIST = `Annas Wünsche ${run}`;
let familyA = "";
let familyB = "";
let foreignList = "";

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

test.describe.serial("Wunschzettel", () => {
  let a: Page;
  let listUrl = "";

  test.beforeAll(async ({ browser }) => {
    const fa = await admin.family.create({ data: { name: "Familie Muster" } });
    const fb = await admin.family.create({ data: { name: "Familie Beispiel" } });
    familyA = fa.id;
    familyB = fb.id;
    foreignList = (await admin.wishlist.create({ data: { familyId: fb.id, personName: "Fremde Person", title: `Fremder Zettel ${run}`, createdById: "niemand" } })).id;
    await admin.birthday.create({ data: { familyId: fa.id, name: "Anna Muster", month: 2, day: 3, createdById: "niemand" } });
    for (const [key, who, role] of [["anna", anna, "OWNER"], ["ben", ben, "MEMBER"]] as const) {
      const u = await admin.user.create({ data: { id: `${key}-w-${run}`, name: who.name, email: who.email, emailVerified: true } });
      await admin.account.create({
        data: { id: `acc-${key}-w-${run}`, accountId: u.id, providerId: "credential", userId: u.id, password: await hash(who.phrase, { memoryCost: 19456, timeCost: 2, parallelism: 1 }) },
      });
      await admin.familyMembership.create({ data: { familyId: familyA, userId: u.id, role } });
      await admin.familyProfile.create({ data: { familyId: familyA, displayName: who.name, userId: u.id } });
    }
    a = await signIn(browser, anna);
  });

  test.afterAll(async () => {
    await admin.family.deleteMany({ where: { id: { in: [familyA, familyB] } } });
    await admin.user.deleteMany({ where: { id: { in: [`anna-w-${run}`, `ben-w-${run}`] } } });
    await admin.$disconnect();
  });

  test("Anna legt einen Wunschzettel mit Geburtstag und Wünschen an (375 px)", async () => {
    await a.goto("/geburtstage");
    await a.getByRole("link", { name: "Wunschzettel" }).first().click();
    await expect(a.getByRole("heading", { name: "Wunschzettel", exact: true })).toBeVisible();
    const form = a.locator("form").filter({ has: a.getByRole("button", { name: "Wunschzettel anlegen" }) });
    await form.getByLabel("Name des Wunschzettels").fill(LIST);
    await form.getByLabel("Für wen?").selectOption({ label: "Anna Muster" });
    await form.getByLabel("Geburtstag verknüpfen (optional)").selectOption({ label: "Anna Muster (3.2.)" });
    await form.getByRole("button", { name: "Wunschzettel anlegen" }).click();
    await expect(a.getByRole("heading", { name: LIST })).toBeVisible();
    await expect(a.getByTestId("next-occasion")).toContainText("Geburtstag am 03.02.");
    listUrl = new URL(a.url()).pathname;

    const wish = a.locator("form").filter({ has: a.getByRole("button", { name: "Wunsch speichern" }) });
    await wish.getByLabel("Wunsch", { exact: true }).fill("Fahrrad");
    await wish.getByLabel("Link (optional, nur https://)").fill("https://example.org/fahrrad");
    await wish.getByLabel("Preis (optional)").fill("249,90");
    await wish.getByLabel("Priorität").selectOption({ label: "Herzenswunsch" });
    await wish.getByLabel("Anlass").selectOption({ label: "Geburtstag" });
    await wish.getByRole("button", { name: "Wunsch speichern" }).click();
    const row = a.getByTestId("wish-row").filter({ hasText: "Fahrrad" });
    await expect(row).toContainText("249,90 €");
    await expect(row).toContainText("Herzenswunsch");
    const link = row.getByRole("link", { name: /Zum Angebot/ });
    await expect(link).toHaveAttribute("href", "https://example.org/fahrrad");
    await expect(link).toHaveAttribute("rel", /noopener/);
    // no reserve button on her own list
    await expect(row.getByRole("button", { name: "Ich schenke das" })).toHaveCount(0);
    await noOverflow(a);

    // the birthday page links the list
    await a.goto("/geburtstage");
    await expect(a.getByRole("link", { name: `Wunschzettel: ${LIST}` })).toBeVisible();
    await noOverflow(a);
  });

  test("Ben reserviert, Anna merkt nichts; die andere Familie bleibt unsichtbar", async ({ browser }) => {
    const b = await signIn(browser, ben);
    await b.goto("/wuensche");
    await b.getByRole("link", { name: LIST }).click();
    const row = b.getByTestId("wish-row").filter({ hasText: "Fahrrad" });
    await row.getByRole("button", { name: "Ich schenke das" }).click();
    await expect(b.getByText("Reserviert. Die beschenkte Person sieht das nicht.")).toBeVisible();
    await expect(b.getByTestId("wish-row").filter({ hasText: "Fahrrad" })).toContainText("Von dir reserviert");
    await noOverflow(b);

    await b.goto(`/wuensche/${foreignList}`);
    await expect(b.getByText(`Fremder Zettel ${run}`)).toHaveCount(0);
    await b.goto("/wuensche");
    await expect(b.getByText(`Fremder Zettel ${run}`)).toHaveCount(0);
    await b.context().close();

    await a.goto(listUrl);
    const own = a.getByTestId("wish-row").filter({ hasText: "Fahrrad" });
    await expect(own).toBeVisible();
    await expect(a.getByText("Überraschungsmodus: Du siehst nicht")).toBeVisible();
    await expect(own).not.toContainText(/reserviert/i);
    await expect(own).not.toContainText("Ben Muster");
    await expect(own.getByRole("button", { name: "Ich schenke das" })).toHaveCount(0);
    // she cannot switch the surprise mode off or hand the list to someone else
    await a.getByText("Einstellungen öffnen").click();
    await expect(a.getByLabel(/Überraschungsmodus/)).toHaveCount(0);
    await expect(a.getByLabel("Für wen?")).toHaveCount(0);
  });
});
