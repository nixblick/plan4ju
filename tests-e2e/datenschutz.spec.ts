import { randomBytes } from "node:crypto";
import { hash } from "@node-rs/argon2";
import { PrismaClient } from "@prisma/client";
import { expect, test, type Browser, type Page } from "@playwright/test";

// Export, account deletion and family deletion on /konto at 375 px (docs/datenschutz.md).
const run = randomBytes(4).toString("hex");
const mail = (who: string) => `${who}-ds-${run}@example.test`;
const secret = () => randomBytes(12).toString("base64url"); // generated at run time, never stored
const admin = new PrismaClient({ datasourceUrl: process.env.DATABASE_ADMIN_URL });
const FAMILY = `Familie Muster ${run}`;
const people = {
  anna: { name: "Anna Muster", email: mail("anna"), phrase: secret() },
  ben: { name: "Ben Muster", email: mail("ben"), phrase: secret() },
};
let familyId = "";
const sessions: Record<string, Page> = {};

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

test.describe.serial("Datenschutz", () => {
  // Users without sign-up: the full E2E run is close to the sign-up limit (see einkauf.spec.ts).
  test.beforeAll(async ({ browser }) => {
    familyId = (await admin.family.create({ data: { name: FAMILY } })).id;
    for (const [key, who, role] of [["anna", people.anna, "OWNER"], ["ben", people.ben, "MEMBER"]] as const) {
      const u = await admin.user.create({ data: { id: `${key}-ds-${run}`, name: who.name, email: who.email, emailVerified: true } });
      await admin.account.create({
        data: { id: `acc-${key}-ds-${run}`, accountId: u.id, providerId: "credential", userId: u.id, password: await hash(who.phrase, { memoryCost: 19456, timeCost: 2, parallelism: 1 }) },
      });
      await admin.familyMembership.create({ data: { familyId, userId: u.id, role } });
      await admin.familyProfile.create({ data: { familyId, displayName: who.name, userId: u.id } });
    }
    await admin.task.create({ data: { familyId, title: `Annas Aufgabe ${run}`, createdById: `anna-ds-${run}` } });
    sessions.anna = await signIn(browser, people.anna);
    sessions.ben = await signIn(browser, people.ben);
  });

  test.afterAll(async () => {
    await Promise.all(Object.values(sessions).map((p) => p.context().close()));
    await admin.family.deleteMany({ where: { id: familyId } });
    await admin.user.deleteMany({ where: { email: { in: Object.values(people).map((p) => p.email) } } });
    await admin.$disconnect();
  });

  test("Ben lädt seine Daten herunter, ohne Fremdes", async () => {
    const p = sessions.ben!;
    await p.goto("/konto");
    const [download] = await Promise.all([p.waitForEvent("download"), p.getByRole("link", { name: "Daten herunterladen" }).click()]);
    expect(download.suggestedFilename()).toMatch(/^plan4ju-daten-\d{4}-\d{2}-\d{2}\.json$/);
    const body = await (await p.request.get("/api/konto/export")).text();
    const data = JSON.parse(body);
    expect(data.account.email).toBe(people.ben.email);
    expect(body).not.toContain(`Annas Aufgabe ${run}`);
    expect(body).not.toContain(people.anna.email);
  });

  test("Anna ist letzte Owner und kann ihr Konto noch nicht löschen", async () => {
    const p = sessions.anna!;
    await p.goto("/konto");
    await expect(p.getByText("Du bist letzter Owner von:")).toBeVisible();
    await expect(p.getByRole("button", { name: "Konto löschen" })).toHaveCount(0);
  });

  test("Ben löscht sein Konto, erst mit falschem, dann mit richtigem Kennwort", async () => {
    const p = sessions.ben!;
    await p.goto("/konto");
    await p.getByLabel("Kennwort zur Bestätigung").fill("falsch-falsch-falsch");
    await p.getByLabel("Ja, mein Konto endgültig löschen").check();
    await p.getByRole("button", { name: "Konto löschen" }).click();
    await expect(p.getByText("Das aktuelle Kennwort stimmt nicht.")).toBeVisible();
    await p.getByLabel("Kennwort zur Bestätigung").fill(people.ben.phrase);
    await p.getByLabel("Ja, mein Konto endgültig löschen").check();
    await p.getByRole("button", { name: "Konto löschen" }).click();
    await expect(p.getByText("Dein Konto und deine persönlichen Daten sind gelöscht.")).toBeVisible();
    expect(await admin.user.count({ where: { email: people.ben.email } })).toBe(0);
    expect(await admin.task.count({ where: { familyId } })).toBe(1);
  });

  test("Anna löscht die Familie mit dem Familiennamen", async () => {
    const p = sessions.anna!;
    await p.goto("/konto");
    await p.getByLabel("Zur Bestätigung den Familiennamen eingeben").fill("Falscher Name");
    await p.getByRole("button", { name: "Familie endgültig löschen" }).click();
    await expect(p.getByText("Der Familienname stimmt nicht.")).toBeVisible();
    await p.getByLabel("Zur Bestätigung den Familiennamen eingeben").fill(FAMILY);
    await p.getByRole("button", { name: "Familie endgültig löschen" }).click();
    await expect(p.getByText("Die Familie ist mit allen Einträgen gelöscht.")).toBeVisible();
    expect(await admin.family.count({ where: { id: familyId } })).toBe(0);
    await p.goto("/konto");
    await expect(p.getByText("Du bist letzter Owner von:")).toHaveCount(0);
    await expect(p.getByRole("button", { name: "Konto löschen" })).toBeVisible();
  });
});
