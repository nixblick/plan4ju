import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { expect, test, type Page } from "@playwright/test";
import { createFamilyWithOwnerInvitation } from "../src/server/admin";

const run = randomBytes(4).toString("hex");
const email = `fb-${run}@example.test`;
const admin = new PrismaClient({ datasourceUrl: process.env.DATABASE_ADMIN_URL });
let familyId = "";
let page: Page;

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

  test("Knopf ist bei 375 px sichtbar und liegt über der Tab-Leiste", async () => {
    for (const path of ["/", "/aufgaben"]) {
      await page.goto(path);
      const button = page.getByTestId("feedback-button");
      await expect(button).toBeVisible();
      const b = (await button.boundingBox())!;
      const nav = (await page.locator("nav[aria-label='Hauptmenü']:visible").boundingBox())!;
      expect(b.y + b.height).toBeLessThanOrEqual(nav.y);
      expect(b.x + b.width).toBeLessThanOrEqual(375);
      // Nothing covers the button: the topmost element at its centre belongs to it.
      const onTop = await page.evaluate(({ x, y }) => {
        const el = document.elementFromPoint(x, y);
        return !!el?.closest("[data-testid='feedback-button']");
      }, { x: b.x + b.width / 2, y: b.y + b.height / 2 });
      expect(onTop).toBe(true);
    }
    await expect(page.getByTestId("feedback-tile")).toBeHidden(); // only on the dashboard
    await page.goto("/");
    await expect(page.getByTestId("feedback-tile")).toBeVisible();
  });

  test("Knopf → Formular → Mail mit Text, Name und Bild in Mailpit", async () => {
    await page.goto("/aufgaben?geheim=1");
    await page.getByTestId("feedback-button").click();
    const dialog = page.getByRole("dialog", { name: "Feedback geben" });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Idee").check();
    await dialog.getByLabel("Was möchtest du uns sagen?").fill(`Bitte eine Einkaufsliste ${run}`);
    await dialog.getByLabel("Dein Name (optional)").fill("Udo Muster");
    await dialog.getByRole("button", { name: "Diese Seite aufnehmen" }).click();
    await expect(dialog.getByText(/Aufnahme angehängt/)).toBeVisible({ timeout: 20_000 });
    await dialog.getByRole("button", { name: "Absenden" }).click();
    await expect(page.getByText("Danke, ist angekommen!")).toBeVisible();
    await expect(dialog).toBeHidden();

    const row = await admin.feedback.findFirstOrThrow({ where: { familyId, message: `Bitte eine Einkaufsliste ${run}` } });
    expect(row).toMatchObject({ kind: "IDEA", pagePath: "/aufgaben", screenWidth: 375, imageType: "image/png" });
    expect(row.image!.length).toBeGreaterThan(1000);
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

  test("Menü-Eintrag öffnet das Formular auf dem Computer", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, storageState: await page.context().storageState() });
    const p = await ctx.newPage();
    await p.goto("/geburtstage");
    await p.getByRole("button", { name: "Feedback geben" }).click();
    await expect(p.getByRole("dialog", { name: "Feedback geben" })).toBeVisible();
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
      await page.goto("/familie/meldungen");
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
