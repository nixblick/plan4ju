import { randomBytes } from "node:crypto";
import { hash } from "@node-rs/argon2";
import { PrismaClient } from "@prisma/client";
import { expect, test, type Browser, type Page } from "@playwright/test";

// Achtsamkeit: Anna (owner) rates herself privately, for the family and for Ben only. Ben sees exactly
// what was shared with him, nothing hints at the private entry. Users without sign-up (see einkauf.spec.ts).
const run = randomBytes(4).toString("hex");
const admin = new PrismaClient({ datasourceUrl: process.env.DATABASE_ADMIN_URL });
const secret = () => randomBytes(12).toString("base64url");
const anna = { name: "Anna Muster", email: `anna-m-${run}@example.test`, phrase: secret() };
const ben = { name: "Ben Muster", email: `ben-m-${run}@example.test`, phrase: secret() };
const PRIVATE_NOTE = `Nur fuer mich ${run}`;
const FAMILY_NOTE = `Gut geschlafen ${run}`;
const SHARED_NOTE = `Fuer Ben ${run}`;
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

async function rate(p: Page, o: { topic: string; rating: number; note: string; visibility: string; viewer?: string }) {
  const form = p.getByRole("form", { name: "Bewertung erfassen" });
  await form.getByRole("combobox", { name: "Thema", exact: true }).selectOption({ label: o.topic });
  await form.locator("label").filter({ has: p.locator(`input[name=rating][value="${o.rating}"]`) }).click();
  await expect(form.getByLabel(new RegExp(`^\\S+ ${o.rating} von 5`))).toBeChecked();
  await form.getByLabel("Notiz (optional)").fill(o.note);
  await form.getByLabel(o.visibility, { exact: false }).check();
  if (o.viewer) await form.getByLabel(o.viewer).check();
  await form.getByRole("button", { name: "Speichern" }).click();
  await expect(p.getByText(o.note)).toBeVisible();
  await expect(p.getByRole("status")).toHaveText("Eintrag gespeichert.");
}

test.describe.serial("Achtsamkeit", () => {
  test.beforeAll(async () => {
    familyA = (await admin.family.create({ data: { name: "Familie Muster" } })).id;
    for (const [key, who, role] of [["anna", anna, "OWNER"], ["ben", ben, "MEMBER"]] as const) {
      const u = await admin.user.create({ data: { id: `${key}-m-${run}`, name: who.name, email: who.email, emailVerified: true } });
      await admin.account.create({
        data: { id: `acc-${key}-m-${run}`, accountId: u.id, providerId: "credential", userId: u.id, password: await hash(who.phrase, { memoryCost: 19456, timeCost: 2, parallelism: 1 }) },
      });
      await admin.familyMembership.create({ data: { familyId: familyA, userId: u.id, role } });
      await admin.familyProfile.create({ data: { familyId: familyA, displayName: who.name, userId: u.id } });
    }
  });

  test.afterAll(async () => {
    await admin.family.deleteMany({ where: { id: familyA } });
    await admin.user.deleteMany({ where: { id: { in: [`anna-m-${run}`, `ben-m-${run}`] } } });
    await admin.$disconnect();
  });

  test("Anna bewertet privat, für die Familie und nur für Ben (375 px)", async ({ browser }) => {
    const a = await signIn(browser, anna);
    await a.goto("/familie/mitglieder");
    await a.getByRole("navigation", { name: "Bereiche der Familie" }).getByRole("link", { name: "Achtsamkeit" }).click();
    await expect(a.getByRole("heading", { name: "Achtsamkeit" })).toBeVisible();
    await noOverflow(a);
    await rate(a, { topic: "Stimmung", rating: 2, note: PRIVATE_NOTE, visibility: "Nur ich" });
    await rate(a, { topic: "Schlaf", rating: 5, note: FAMILY_NOTE, visibility: "Ganze Familie" });
    await rate(a, { topic: "Arbeit", rating: 3, note: SHARED_NOTE, visibility: "Ausgewählte Personen", viewer: "Ben Muster" });
    await expect(a.getByText(PRIVATE_NOTE)).toBeVisible();
    await expect(a.getByText("von dir · Ausgewählte Personen: Ben Muster")).toBeVisible();
    await expect(a.locator("[data-feedback-ignore='true']").getByText(PRIVATE_NOTE)).toBeVisible();
    await noOverflow(a);
    await a.getByRole("link", { name: "Monat" }).click();
    await expect(a.getByText(/Ø 5 \(1 Bewertung\)/)).toBeVisible();
    await noOverflow(a);
    await a.context().close();
  });

  test("Ben sieht nur Freigegebenes, keine Spur des privaten Eintrags", async ({ browser }) => {
    const b = await signIn(browser, ben);
    await expect(b.locator("body")).not.toContainText(PRIVATE_NOTE);
    await b.goto("/achtsamkeit");
    await b.getByRole("combobox", { name: "Person", exact: true }).selectOption({ label: "Anna Muster" });
    await b.getByRole("button", { name: "Anzeigen" }).click();
    await expect(b.getByText(FAMILY_NOTE)).toBeVisible();
    await expect(b.getByText(SHARED_NOTE)).toBeVisible();
    await expect(b.locator("body")).not.toContainText(PRIVATE_NOTE);
    await expect(b.locator("body")).not.toContainText("Stimmung: 2 von 5");
    await expect(b.getByRole("button", { name: /löschen/ })).toHaveCount(0);
    await b.getByRole("link", { name: "Monat" }).click();
    await expect(b.locator("li").filter({ hasText: "Stimmung" })).toContainText("–");
    await noOverflow(b);
    await b.goto("/");
    await expect(b.locator("body")).not.toContainText(FAMILY_NOTE);
    await b.context().close();
  });
});
