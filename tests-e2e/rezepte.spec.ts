import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { createFamilyWithOwnerInvitation } from "../src/server/admin";

// Familie Muster (Anna) keeps recipes; a recipe of Familie Beispiel (created directly, no second
// sign-up: the E2E run is close to the sign-up limit per address) must stay invisible to her.
const run = randomBytes(4).toString("hex");
const admin = new PrismaClient({ datasourceUrl: process.env.DATABASE_ADMIN_URL });
const secret = () => randomBytes(12).toString("base64url");
const anna = { name: "Anna Muster", email: `anna-r-${run}@example.test`, phrase: secret() };
const TITLE = `Kartoffelsuppe ${run}`;
const pages: Record<string, Page> = {};
let foreignId = "";
let foreignImage = "";
let familyA = "";

async function join(browser: Browser, token: string, who: { name: string; phrase: string }, width = 375): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width, height: 812 } });
  const page = await ctx.newPage();
  await page.goto(`/einladung/${token}`);
  await page.getByLabel("Dein Name").fill(who.name);
  await page.getByLabel(/^Kennwort/).fill(who.phrase);
  await page.getByRole("button", { name: "Zugang anlegen und beitreten" }).click();
  await expect(page.getByTestId("week")).toBeVisible();
  return page;
}

async function noOverflow(p: Page) {
  const { scroll, client } = await p.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  expect(scroll, `${p.url()}: ${scroll} > ${client}`).toBeLessThanOrEqual(client);
}

test.describe.serial("Rezepte", () => {
  test.beforeAll(async ({ browser }) => {
    const a = await createFamilyWithOwnerInvitation(admin, { name: "Familie Muster", ownerEmail: anna.email });
    const b = await createFamilyWithOwnerInvitation(admin, { name: "Familie Beispiel", ownerEmail: `clara-r-${run}@example.test` });
    const r = await admin.recipe.create({ data: { familyId: b.familyId, title: `Fremdes Rezept ${run}`, createdById: "niemand" } });
    foreignId = r.id;
    familyA = a.familyId;
    // 1x1 PNG of the other family, stored directly
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGNoAAAAggCBd81ytgAAAABJRU5ErkJggg==", "base64");
    foreignImage = (await admin.image.create({ data: { familyId: b.familyId, recipeId: r.id, mime: "image/png", size: png.length, data: png, createdById: "niemand" } })).id;
    pages.anna = await join(browser, a.token, anna);
  });

  test.afterAll(async () => {
    await admin.$disconnect();
  });

  test("anlegen, Portionen umrechnen, bearbeiten, löschen (375 px)", async () => {
    const p = pages.anna!;
    await p.goto("/rezepte/neu");
    await noOverflow(p);
    const form = p.locator("form").filter({ has: p.getByRole("button", { name: "Rezept speichern" }) });
    await form.getByLabel("Titel").fill(TITLE);
    await form.getByLabel("Portionen").fill("4");
    await form.getByLabel("Menge 1", { exact: true }).fill("1");
    await form.getByLabel("Einheit 1", { exact: true }).fill("kg");
    await form.getByLabel("Zutat 1", { exact: true }).fill("Kartoffeln");
    await form.getByRole("button", { name: "Zutat hinzufügen" }).click();
    await form.getByLabel("Menge 2", { exact: true }).fill("1/2");
    await form.getByLabel("Einheit 2", { exact: true }).fill("TL");
    await form.getByLabel("Zutat 2", { exact: true }).fill("Salz");
    await form.getByLabel(/^Zubereitung/).fill("Schälen.\n\nKochen.");
    await form.getByLabel(/^Tags/).fill("Suppe, schnell");
    await form.getByRole("button", { name: "Rezept speichern" }).click();

    await expect(p.getByRole("heading", { name: TITLE })).toBeVisible();
    await expect(p.getByRole("status")).toContainText("Rezept gespeichert");
    await expect(p.getByTestId("ingredient")).toHaveText(["1 kgKartoffeln", "½ TLSalz"]);
    await noOverflow(p);

    await p.getByRole("spinbutton", { name: "Für" }).fill("2");
    await p.getByRole("button", { name: "Umrechnen" }).click();
    await expect(p.getByTestId("ingredient")).toHaveText(["½ kgKartoffeln", "¼ TLSalz"]);

    await p.getByText("Bearbeiten").click();
    const edit = p.locator("form").filter({ has: p.getByRole("button", { name: "Änderungen speichern" }) });
    await edit.getByLabel("Titel").fill(`${TITLE} neu`);
    await edit.getByRole("button", { name: "Änderungen speichern" }).click();
    await expect(p.getByRole("heading", { name: `${TITLE} neu` })).toBeVisible();

    await p.goto("/rezepte");
    await expect(p.getByTestId("recipe-row")).toContainText([`${TITLE} neu`]);
    await noOverflow(p);
  });

  test("Rezept einer anderen Familie bleibt unsichtbar, auch per Adresse", async () => {
    const p = pages.anna!;
    await p.goto("/rezepte");
    await expect(p.locator("main")).not.toContainText("Fremdes Rezept");
    const res = await p.goto(`/rezepte/${foreignId}`);
    expect(res?.status()).toBe(404);
  });

  test("Essensplan: Rezept heute planen, Koch zuweisen, Kachel, Woche kopieren, Rezeptidee ohne KI (375 px)", async () => {
    const p = pages.anna!;
    await p.goto("/essen");
    await noOverflow(p);
    const today = p.getByTestId("meal-day-today");
    const mittag = today.getByTestId("meal-slot").nth(1);
    await mittag.locator("summary").click();
    await mittag.getByLabel("Rezept").selectOption({ label: `${TITLE} neu` });
    await mittag.getByRole("checkbox", { name: "Anna Muster" }).check();
    await mittag.getByRole("button", { name: "Planen" }).click();
    await expect(p.getByRole("status")).toContainText("Essen geplant");
    await expect(p.getByTestId("meal-day-today").getByTestId("meal-title")).toHaveText([`${TITLE} neu`]);
    await noOverflow(p);

    await p.goto("/");
    const tile = p.getByRole("region", { name: "Essen heute" });
    await expect(tile.getByTestId("today-meal")).toContainText(`${TITLE} neu`);
    await expect(tile).toContainText("kocht: Anna Muster");

    await p.goto("/essen");
    await p.getByTestId("copy-week").click();
    await expect(p.getByRole("status")).toContainText("Woche kopiert");
    await expect(p.getByTestId("meal-title")).toHaveText([`${TITLE} neu`]);
    await noOverflow(p);

    await p.goto("/essen/idee");
    await expect(p.locator("main")).toContainText("nicht eingerichtet");
    await noOverflow(p);
  });

  test("Import lehnt interne Adressen ab, ohne abzurufen", async () => {
    const p = pages.anna!;
    await p.goto("/rezepte/neu");
    await p.getByLabel("Adresse des Rezepts (https)").fill("https://127.0.0.1/rezept");
    await p.getByRole("button", { name: "Rezept einlesen" }).click();
    await expect(p.locator("main").getByRole("alert")).toContainText("internes oder gesperrtes Netz");
  });

  test("löschen", async () => {
    const p = pages.anna!;
    await p.getByRole("link", { name: "← Alle Rezepte" }).click();
    await p.getByTestId("recipe-row").first().click();
    await p.getByRole("button", { name: "Rezept löschen" }).click();
    await expect(p.getByRole("status")).toContainText("Rezept gelöscht");
    await expect(p.locator("main")).not.toContainText(TITLE);
  });

  test("Bild hochladen, anzeigen, entfernen; Bild einer anderen Familie gibt 404 (375 px)", async () => {
    const p = pages.anna!;
    const r = await admin.recipe.create({ data: { familyId: familyA, title: `Bildrezept ${run}`, createdById: "niemand" } });
    await p.goto(`/rezepte/${r.id}`);
    // a real, decodable JPEG made by the browser
    const b64 = await p.evaluate(async () => {
      const c = document.createElement("canvas");
      c.width = 40;
      c.height = 30;
      const g = c.getContext("2d")!;
      g.fillStyle = "#c2552d";
      g.fillRect(0, 0, 40, 30);
      const blob: Blob = await new Promise((res) => c.toBlob((x) => res(x!), "image/jpeg", 0.9));
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let s = "";
      for (const x of bytes) s += String.fromCharCode(x);
      return btoa(s);
    });
    await p.getByLabel("Bild auswählen").setInputFiles({ name: "foto.jpg", mimeType: "image/jpeg", buffer: Buffer.from(b64, "base64") });
    await p.getByRole("button", { name: "Bild hochladen" }).click();
    await expect(p.getByText("Bild gespeichert.")).toBeVisible();
    const img = p.getByRole("img", { name: `Bild zu Bildrezept ${run}` });
    await expect(img).toBeVisible();
    await expect.poll(() => img.evaluate((e) => (e as HTMLImageElement).naturalWidth)).toBe(40);
    await noOverflow(p);

    await p.getByLabel("Bild auswählen").setInputFiles({ name: "x.png", mimeType: "image/png", buffer: Buffer.from("<svg/>") });
    await p.getByRole("button", { name: "Bild ersetzen" }).click();
    await expect(p.getByText("Erlaubt sind PNG, JPEG und WebP")).toBeVisible();

    expect((await p.request.get(`/api/bild/${foreignImage}`)).status()).toBe(404);
    const own = await admin.image.findFirstOrThrow({ where: { recipeId: r.id } });
    expect((await p.request.get(`/api/bild/${own.id}`)).status()).toBe(200);

    await p.getByRole("button", { name: "Bild entfernen" }).click();
    await expect(p.getByText("Bild entfernt.")).toBeVisible();
    expect((await p.request.get(`/api/bild/${own.id}`)).status()).toBe(404);
    await admin.recipe.delete({ where: { id: r.id } });
  });

});
