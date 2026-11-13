import { randomBytes } from "node:crypto";
import { hash } from "@node-rs/argon2";
import { PrismaClient } from "@prisma/client";
import { expect, test, type Browser, type Page } from "@playwright/test";

// Release 0.3 acceptance against the container: a recipe is created by hand, planned for today
// with a cook, chosen ingredients land traceably on the shopping list with a shop, the second
// member sees it, the other family does not, 375 px without overflow. URL import of a real page
// needs an external https fetch (the SSRF guard refuses local addresses by design); the parser is
// covered by tests/recipes-lib.test.ts, here only the refusal of an internal address is checked.
// Users are created directly with a password (no sign-up: the 0.2 acceptance already signs up 3).
const run = randomBytes(4).toString("hex");
const admin = new PrismaClient({ datasourceUrl: process.env.DATABASE_ADMIN_URL });
const shots = process.env.ABNAHME_DIR ?? "test-results/abnahme-0.3";
const secret = () => randomBytes(12).toString("base64url");
const people = {
  anna: { name: "Anna Muster", email: `anna-a3-${run}@example.test`, phrase: secret() },
  ben: { name: "Ben Muster", email: `ben-a3-${run}@example.test`, phrase: secret() },
  clara: { name: "Clara Beispiel", email: `clara-a3-${run}@example.test`, phrase: secret() },
};
const TITLE = `Linsensuppe ${run}`;
const SECRETS = [TITLE, `Rote Linsen ${run}`, `Suppengrün ${run}`, "Anna Muster", "Ben Muster"];
const pages: Record<string, Page> = {};
const families: string[] = [];

async function noOverflow(p: Page) {
  const { scroll, client } = await p.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  expect(scroll, `${p.url()}: ${scroll} > ${client}`).toBeLessThanOrEqual(client);
}

async function createUser(key: keyof typeof people, familyId: string, role: "OWNER" | "MEMBER") {
  const who = people[key];
  const u = await admin.user.create({ data: { id: `${key}-a3-${run}`, name: who.name, email: who.email, emailVerified: true } });
  await admin.account.create({
    data: { id: `acc-${key}-a3-${run}`, accountId: u.id, providerId: "credential", userId: u.id, password: await hash(who.phrase, { memoryCost: 19456, timeCost: 2, parallelism: 1 }) },
  });
  await admin.familyMembership.create({ data: { familyId, userId: u.id, role } });
  await admin.familyProfile.create({ data: { familyId, displayName: who.name, userId: u.id } });
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

test.describe.serial("Abnahme Release 0.3", () => {
  test.beforeAll(async ({ browser }) => {
    const fa = await admin.family.create({ data: { name: "Familie Muster" } });
    const fb = await admin.family.create({ data: { name: "Familie Beispiel" } });
    families.push(fa.id, fb.id);
    await createUser("anna", fa.id, "OWNER");
    await createUser("ben", fa.id, "MEMBER");
    await createUser("clara", fb.id, "OWNER");
    pages.anna = await signIn(browser, people.anna);
  });

  test.afterAll(async () => {
    await Promise.all(Object.values(pages).map((p) => p.context().close()));
    await admin.family.deleteMany({ where: { id: { in: families } } });
    await admin.user.deleteMany({ where: { email: { in: Object.values(people).map((p) => p.email) } } });
    await admin.$disconnect();
  });

  test("Rezept von Hand anlegen", async () => {
    const p = pages.anna!;
    await p.goto("/rezepte/neu");
    await noOverflow(p);
    const form = p.locator("form").filter({ has: p.getByRole("button", { name: "Rezept speichern" }) });
    await form.getByLabel("Titel").fill(TITLE);
    await form.getByLabel("Portionen").fill("4");
    const rows: [string, string, string][] = [["250", "g", `Rote Linsen ${run}`], ["1", "Bund", `Suppengrün ${run}`], ["", "", "Pfeffer"]];
    for (const [n, [q, u, name]] of rows.entries()) {
      if (n > 0) await form.getByRole("button", { name: "Zutat hinzufügen" }).click();
      if (q) await form.getByLabel(`Menge ${n + 1}`, { exact: true }).fill(q);
      if (u) await form.getByLabel(`Einheit ${n + 1}`, { exact: true }).fill(u);
      await form.getByLabel(`Zutat ${n + 1}`, { exact: true }).fill(name);
    }
    await form.getByRole("button", { name: "Rezept speichern" }).click();
    await expect(p.getByRole("heading", { name: TITLE })).toBeVisible();
    await noOverflow(p);
    await p.screenshot({ path: `${shots}/01-rezept.png`, fullPage: true });
  });

  test("URL-Import: interne Adresse wird abgelehnt (Parser-Beleg in recipes-lib.test.ts)", async () => {
    const p = pages.anna!;
    await p.goto("/rezepte/neu");
    await p.getByLabel("Adresse des Rezepts (https)").fill("https://127.0.0.1/rezept");
    await p.getByRole("button", { name: "Rezept einlesen" }).click();
    await expect(p.locator("main").getByRole("alert")).toContainText("internes oder gesperrtes Netz");
  });

  test("Im Wochenplan für heute planen, Ben kocht", async () => {
    const p = pages.anna!;
    await p.goto("/essen");
    const abend = p.getByTestId("meal-day-today").getByTestId("meal-slot").nth(2);
    await abend.locator("summary").click();
    await abend.getByLabel("Rezept").selectOption({ label: TITLE });
    await abend.getByRole("checkbox", { name: "Ben Muster" }).check();
    await abend.getByRole("button", { name: "Planen" }).click();
    await expect(p.getByRole("status")).toContainText("Essen geplant");
    await expect(p.getByTestId("meal-day-today")).toContainText("Kocht: Ben Muster");
    await noOverflow(p);
    await p.screenshot({ path: `${shots}/02-wochenplan.png`, fullPage: true });

    await p.goto("/");
    const tile = p.getByRole("region", { name: "Essen heute" });
    await expect(tile).toContainText(TITLE);
    await expect(tile).toContainText("kocht: Ben Muster");
  });

  test("Ausgewählte Zutaten auf die Einkaufsliste, mit Geschäft und Herkunft", async () => {
    const p = pages.anna!;
    await p.goto("/essen");
    await p.getByTestId("meal-day-today").getByTestId("meal-slot").nth(2).locator("summary").click();
    await p.getByTestId("meal-day-today").getByRole("link", { name: "Zutaten einkaufen" }).click();
    await expect(p.getByRole("heading", { name: `Zutaten einkaufen: ${TITLE}` })).toBeVisible();
    await expect(p.getByTestId("transfer-row")).toHaveCount(3);
    await p.getByRole("checkbox", { name: "Pfeffer" }).uncheck();
    await p.getByLabel("Geschäft 2").selectOption({ label: "Drogerie" });
    await noOverflow(p);
    await p.screenshot({ path: `${shots}/03-zutaten-auswahl.png`, fullPage: true });
    await p.getByRole("button", { name: "Ausgewählte auf die Einkaufsliste" }).click();

    await expect(p.getByRole("status")).toContainText("Zutaten auf die Einkaufsliste übertragen");
    await expect(p.getByTestId("item-name")).toHaveText([`Rote Linsen ${run}`, `Suppengrün ${run}`]);
    await expect(p.locator("main")).not.toContainText("Pfeffer");
    const linsen = p.getByTestId("open-item").filter({ hasText: "Rote Linsen" });
    await expect(linsen).toContainText("250 g");
    await expect(linsen).toContainText(`aus Rezept „${TITLE}“`);
    await expect(p.getByTestId("open-item").filter({ hasText: "Suppengrün" })).toContainText("Drogerie");
    await noOverflow(p);
    await p.screenshot({ path: `${shots}/04-einkaufsliste.png`, fullPage: true });
  });

  test("Zweites Mitglied sieht Plan und Liste", async ({ browser }) => {
    const b = await signIn(browser, people.ben);
    pages.ben = b;
    await expect(b.getByRole("region", { name: "Essen heute" })).toContainText(TITLE);
    await b.goto("/einkauf");
    await expect(b.getByTestId("item-name")).toHaveText([`Rote Linsen ${run}`, `Suppengrün ${run}`]);
    await expect(b.getByTestId("open-item").filter({ hasText: "Rote Linsen" })).toContainText(`aus Rezept „${TITLE}“`);
    await noOverflow(b);
    await b.screenshot({ path: `${shots}/05-ben-einkauf.png`, fullPage: true });
  });

  test("Andere Familie sieht nichts", async ({ browser }) => {
    const c = await signIn(browser, people.clara);
    pages.clara = c;
    for (const path of ["/", "/essen", "/rezepte", "/einkauf"]) {
      await c.goto(path);
      for (const s of SECRETS) await expect(c.locator("body"), `${path}: ${s}`).not.toContainText(s);
    }
    await c.screenshot({ path: `${shots}/06-andere-familie.png`, fullPage: true });
  });

  test("375 px ohne Überlauf", async () => {
    const p = pages.anna!;
    for (const path of ["/", "/essen", "/rezepte", "/rezepte/neu", "/einkauf", "/einkauf/geschaefte", "/essen/idee"]) {
      await p.goto(path);
      await expect(p.locator("main")).toBeVisible();
      await noOverflow(p);
      const name = path.replace(/[^a-z]+/g, "-").replace(/^-|-$/g, "") || "start";
      await p.screenshot({ path: `${shots}/375-${name}.png`, fullPage: true });
    }
  });
});
