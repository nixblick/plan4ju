import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { expect, test, type Page } from "@playwright/test";
import { createFamilyWithOwnerInvitation } from "../src/server/admin";

const run = randomBytes(4).toString("hex");
const email = `fb-${run}@example.test`;
const admin = new PrismaClient({ datasourceUrl: process.env.DATABASE_ADMIN_URL });
let familyId = "";
let page: Page;
// 1 x 1 pixel PNG
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

test.describe.serial("Feedback", () => {
  test.beforeAll(async ({ browser }) => {
    const f = await createFamilyWithOwnerInvitation(admin, { name: "Familie Muster", ownerEmail: email });
    familyId = f.familyId;
    const ctx = await browser.newContext({ viewport: { width: 375, height: 700 }, isMobile: true, hasTouch: true });
    page = await ctx.newPage();
    await page.goto(`/einladung/${f.token}`);
    await page.getByLabel("Dein Name").fill("Anna Muster");
    await page.getByLabel(/^Kennwort/).fill(randomBytes(12).toString("base64url"));
    await page.getByRole("button", { name: "Zugang anlegen und beitreten" }).click();
    await expect(page.getByTestId("week")).toBeVisible();
  });

  test.afterAll(async () => {
    await page?.context().close();
    if (familyId) await admin.family.deleteMany({ where: { id: familyId } });
    await admin.user.deleteMany({ where: { email } });
    await admin.$disconnect();
  });

  test("0.8: kein schwebender Knopf und keine Kachel mehr, Feedback ist ein Tab unter Einstellungen (375 px)", async () => {
    for (const path of ["/", "/aufgaben"]) {
      await page.goto(path);
      await expect(page.getByTestId("feedback-button")).toHaveCount(0);
      await expect(page.getByTestId("feedback-tile")).toHaveCount(0);
    }
    await page.getByRole("navigation", { name: "Hauptmenü" }).getByRole("link", { name: "Optionen" }).click();
    await page.getByRole("navigation", { name: "Bereiche der Einstellungen" }).getByRole("link", { name: "Feedback" }).click();
    await expect(page).toHaveURL(/\/einstellungen\/feedback$/);
    await expect(page.getByTestId("feedback-form")).toBeVisible();
    const { scroll, client } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
    expect(scroll).toBeLessThanOrEqual(client);
  });

  test("Tab → Formular → Mail mit Text, Name, Seite und Bild in Mailpit", async ({ baseURL }) => {
    // the page the person came from is sent along (referrer, same origin only)
    await page.goto("/einstellungen/feedback", { referer: `${baseURL}/aufgaben?geheim=1` });
    const form = page.getByTestId("feedback-form");
    await form.getByLabel("Idee").check();
    await form.getByLabel("Was möchtest du uns sagen?").fill(`Bitte eine Einkaufsliste ${run}`);
    await form.getByLabel("Dein Name (optional)").fill("Udo Muster");
    await form.getByLabel(/Bild \(optional/).setInputFiles({ name: "bild.png", mimeType: "image/png", buffer: PNG });
    await form.getByRole("button", { name: "Absenden" }).click();
    await expect(page.getByText("Danke, ist angekommen!")).toBeVisible();

    const row = await admin.feedback.findFirstOrThrow({ where: { familyId, message: `Bitte eine Einkaufsliste ${run}` } });
    // Delivered: the picture is in the mail (checked below), not kept in the database (0.7.2).
    expect(row).toMatchObject({ kind: "IDEA", pagePath: "/aufgaben", screenWidth: 375, imageType: null, image: null });
    expect(row.authorName).toBe("Udo Muster");
    expect(row.mailedAt).not.toBeNull();

    // The mail itself, as the recipient gets it.
    const api = `http://localhost:${process.env.MAILPIT_UI_PORT}/api/v1`;
    const q = encodeURIComponent(`subject:"Einkaufsliste ${run}"`);
    let msg: { Text: string; ReplyTo: { Address: string }[]; Attachments: { ContentType: string }[] } | undefined;
    await expect.poll(async () => {
      const hits = (await (await fetch(`${api}/search?query=${q}`)).json()) as { messages?: { ID: string }[] };
      if (!hits.messages?.length) return false;
      msg = await (await fetch(`${api}/message/${hits.messages[0]!.ID}`)).json();
      return true;
    }, { timeout: 10_000 }).toBe(true);
    expect(msg!.Text).toContain(`Bitte eine Einkaufsliste ${run}`);
    expect(msg!.Text).toMatch(/Name: +Udo Muster/);
    expect(msg!.Text).toMatch(/Seite: +\/aufgaben\r?\n/);
    expect(msg!.ReplyTo[0]!.Address).toBe(email);
    expect(msg!.Attachments.map((a) => a.ContentType)).toEqual(["image/png"]);
    await fetch(`${api}/search?query=${q}`, { method: "DELETE" });
  });

  test("Einstellungen auf dem Computer: Tab Feedback in der Seitenleiste erreichbar", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, storageState: await page.context().storageState() });
    const p = await ctx.newPage();
    await p.goto("/kalender/geburtstage");
    await expect(p.getByRole("button", { name: "Feedback geben" })).toHaveCount(0);
    await p.getByRole("link", { name: "Einstellungen" }).click();
    await p.getByRole("link", { name: "Feedback", exact: true }).click();
    await expect(p.getByRole("heading", { name: "Feedback geben" })).toBeVisible();
    await ctx.close();
  });

  test("Meldungen: Owner sieht Art, Datum und Versuche fremder Meldungen, Text nur bei eigenen", async () => {
    const owner = await admin.user.findFirstOrThrow({ where: { email } });
    const other = await admin.user.create({ data: { id: `u-fb-other-${run}`, name: "Bea Muster", email: `fb-other-${run}@example.test` } });
    try {
      await admin.familyMembership.create({ data: { familyId, userId: other.id } });
      const base = { familyId, kind: "BUG" as const, pagePath: "/", appVersion: "test", device: "Test", mailAttempts: 2, mailNextAt: new Date(Date.now() + 3_600_000) };
      await admin.feedback.create({ data: { ...base, userId: owner.id, message: "Eigener Text sichtbar" } });
      await admin.feedback.create({ data: { ...base, kind: "IDEA", userId: other.id, message: "Fremder Text geheim" } });
      await page.goto("/einstellungen/meldungen");
      await expect(page.getByText("Eigener Text sichtbar")).toBeVisible();
      await expect(page.getByTestId("meldung-row").filter({ hasText: "Idee" }).first()).toContainText("2 von 5 Versuchen");
      expect(await page.content()).not.toContain("Fremder Text geheim");
    } finally {
      await admin.feedback.deleteMany({ where: { familyId, userId: other.id } });
      await admin.familyMembership.deleteMany({ where: { familyId, userId: other.id } });
      await admin.user.deleteMany({ where: { id: other.id } });
    }
  });
});
