import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { createFamilyWithOwnerInvitation } from "../src/server/admin";
import { createInvitation } from "../src/server/services/invitations";

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

async function join(browser: Browser, token: string, who: { name: string; phrase: string }): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 800 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(`/einladung/${token}`);
  await page.getByLabel("Dein Name").fill(who.name);
  await page.getByLabel(/^Kennwort/).fill(who.phrase);
  await page.getByRole("button", { name: "Zugang anlegen und beitreten" }).click();
  await expect(page.getByTestId("week")).toBeVisible();
  return page;
}

test.describe.serial("Datenschutz", () => {
  test.beforeAll(async ({ browser }) => {
    const a = await createFamilyWithOwnerInvitation(admin, { name: FAMILY, ownerEmail: people.anna.email });
    familyId = a.familyId;
    sessions.anna = await join(browser, a.token, people.anna);
    const anna = await admin.user.findUniqueOrThrow({ where: { email: people.anna.email } });
    await admin.task.create({ data: { familyId, title: `Annas Aufgabe ${run}`, createdById: anna.id } });
    const invite = await createInvitation(anna.id, familyId, { email: people.ben.email, role: "MEMBER" });
    sessions.ben = await join(browser, invite.token, people.ben);
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
