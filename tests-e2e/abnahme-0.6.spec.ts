import { randomBytes } from "node:crypto";
import { hash } from "@node-rs/argon2";
import { PrismaClient } from "@prisma/client";
import { expect, test, type Browser, type Page } from "@playwright/test";

// Release 0.6 acceptance against the container at 375 px: the data export carries only the own data;
// a member deletes the own account; one instance of a series is moved without touching the others;
// an uploaded picture is visible only to the own family. Users are created directly (no sign-up).
const run = randomBytes(4).toString("hex");
const admin = new PrismaClient({ datasourceUrl: process.env.DATABASE_ADMIN_URL });
const shots = process.env.ABNAHME_DIR ?? "test-results/abnahme-0.6";
const secret = () => randomBytes(12).toString("base64url");
const people = {
  anna: { name: "Anna Muster", email: `anna-a6-${run}@example.test`, phrase: secret() },
  ben: { name: "Ben Muster", email: `ben-a6-${run}@example.test`, phrase: secret() },
  dora: { name: "Dora Beispiel", email: `dora-a6-${run}@example.test`, phrase: secret() },
};
const pages: Record<string, Page> = {};
const families: string[] = [];
const users: Record<string, string> = {};

async function noOverflow(p: Page) {
  const { scroll, client } = await p.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  expect(scroll, `${p.url()}: ${scroll} > ${client}`).toBeLessThanOrEqual(client);
}

async function createUser(key: keyof typeof people, familyId: string, role: "OWNER" | "MEMBER") {
  const who = people[key];
  const u = await admin.user.create({ data: { id: `${key}-a6-${run}`, name: who.name, email: who.email, emailVerified: true } });
  await admin.account.create({
    data: { id: `acc-${key}-a6-${run}`, accountId: u.id, providerId: "credential", userId: u.id, password: await hash(who.phrase, { memoryCost: 19456, timeCost: 2, parallelism: 1 }) },
  });
  await admin.familyMembership.create({ data: { familyId, userId: u.id, role } });
  await admin.familyProfile.create({ data: { familyId, displayName: who.name, userId: u.id } });
  users[key] = u.id;
}

async function signIn(browser: Browser, key: keyof typeof people): Promise<Page> {
  const who = people[key];
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const p = await ctx.newPage();
  await p.goto("/anmelden");
  await p.getByLabel("E-Mail-Adresse").fill(who.email);
  await p.getByLabel("Kennwort").fill(who.phrase);
  await p.getByRole("button", { name: /Anmelden/ }).click();
  await expect(p.getByRole("heading", { name: "Familie wählen" })).toBeVisible();
  await p.getByRole("button", { name: "Öffnen" }).click();
  await expect(p.getByTestId("week")).toBeVisible();
  pages[key] = p;
  return p;
}

test.describe.serial("Abnahme Release 0.6", () => {
  test.beforeAll(async ({ browser }) => {
    const fa = await admin.family.create({ data: { name: `Familie Muster ${run}`, timezone: "Europe/Berlin" } });
    const fb = await admin.family.create({ data: { name: `Familie Beispiel ${run}`, timezone: "Europe/Berlin" } });
    families.push(fa.id, fb.id);
    await createUser("anna", fa.id, "OWNER");
    await createUser("ben", fa.id, "MEMBER");
    await createUser("dora", fb.id, "OWNER");
    await admin.task.create({ data: { familyId: fa.id, title: `Annas Aufgabe ${run}`, createdById: users.anna! } });
    await admin.task.create({ data: { familyId: fb.id, title: `Doras Aufgabe ${run}`, createdById: users.dora! } });
    // Weekly on Monday 18:00 (winter time), from 04.01.2027.
    await admin.calendarEvent.create({
      data: { familyId: fa.id, createdById: users.anna!, title: `Chor ${run}`, startsAt: new Date("2027-01-04T17:00:00Z"), endsAt: new Date("2027-01-04T18:00:00Z"), freq: "WEEKLY", weekdays: [0] },
    });
    await signIn(browser, "anna");
    await signIn(browser, "ben");
    await signIn(browser, "dora");
  });

  test.afterAll(async () => {
    await Promise.all(Object.values(pages).map((p) => p.context().close()));
    await admin.family.deleteMany({ where: { id: { in: families } } });
    await admin.user.deleteMany({ where: { email: { in: Object.values(people).map((p) => p.email) } } });
    await admin.$disconnect();
  });

  test("Datenexport enthält nur Eigenes", async () => {
    const p = pages.ben!;
    await p.goto("/konto");
    const [download] = await Promise.all([p.waitForEvent("download"), p.getByRole("link", { name: "Daten herunterladen" }).click()]);
    expect(download.suggestedFilename()).toMatch(/^plan4ju-daten-\d{4}-\d{2}-\d{2}\.json$/);
    const body = await (await p.request.get("/api/konto/export")).text();
    expect(JSON.parse(body).account.email).toBe(people.ben.email);
    expect(body).not.toContain(people.anna.email);
    expect(body).not.toContain(people.dora.email);
    expect(body).not.toContain(`Doras Aufgabe ${run}`);
    await noOverflow(p);
    await p.screenshot({ path: `${shots}/01-konto.png`, fullPage: true });
  });

  test("Ein Serientermin wird verschoben, die übrigen bleiben", async () => {
    const p = pages.anna!;
    await p.goto("/kalender?ansicht=woche&datum=2027-01-11&tag=2027-01-11");
    await p.getByRole("link", { name: `Chor ${run}` }).first().click();
    await expect(p).toHaveURL(/\/kalender\/termin\/[^/]+\/2027-01-11$/);
    await p.getByLabel("Neuer Tag").fill("2027-01-13");
    await p.getByLabel("Beginn").fill("19:00");
    await p.getByLabel("Ende").fill("20:30");
    await p.getByRole("button", { name: "Nur diesen Termin verschieben" }).click();
    await expect(p.getByTestId("instance-state")).toHaveText("Verschoben auf 13.01.2027, 19:00 Uhr.");
    await noOverflow(p);
    await p.screenshot({ path: `${shots}/02-termin-verschoben.png`, fullPage: true });
    await p.goto("/kalender?ansicht=woche&datum=2027-01-11&tag=2027-01-13");
    await expect(p.getByTestId("cal-item-moved")).toHaveText("verschoben vom 11.01.");
    await p.goto("/kalender?ansicht=woche&datum=2027-01-18&tag=2027-01-18");
    await expect(p.getByRole("link", { name: `Chor ${run}` })).toHaveCount(1);
    await expect(p.getByText("18:00–19:00 Uhr")).toBeVisible();
  });

  test("Bild-Upload ist nur für die eigene Familie sichtbar", async () => {
    const p = pages.anna!;
    const r = await admin.recipe.create({ data: { familyId: families[0]!, title: `Bildrezept ${run}`, createdById: users.anna! } });
    await p.goto(`/rezepte/${r.id}`);
    const b64 = await p.evaluate(async () => {
      const c = document.createElement("canvas");
      c.width = 40;
      c.height = 30;
      const g = c.getContext("2d")!;
      g.fillStyle = "#2d7dc2";
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
    await expect(p.getByRole("img", { name: `Bild zu Bildrezept ${run}` })).toBeVisible();
    await noOverflow(p);
    await p.screenshot({ path: `${shots}/03-bild.png`, fullPage: true });
    const img = await admin.image.findFirstOrThrow({ where: { recipeId: r.id } });
    expect((await pages.ben!.request.get(`/api/bild/${img.id}`)).status()).toBe(200);
    expect((await pages.dora!.request.get(`/api/bild/${img.id}`)).status()).toBe(404);
    expect((await pages.dora!.goto(`/rezepte/${r.id}`))?.status()).toBe(404);
  });

  test("Ben löscht sein Konto", async () => {
    const p = pages.ben!;
    await p.goto("/konto");
    await p.getByLabel("Kennwort zur Bestätigung").fill(people.ben.phrase);
    await p.getByLabel("Ja, mein Konto endgültig löschen").check();
    await p.getByRole("button", { name: "Konto löschen" }).click();
    await expect(p.getByText("Dein Konto und deine persönlichen Daten sind gelöscht.")).toBeVisible();
    expect(await admin.user.count({ where: { email: people.ben.email } })).toBe(0);
    // Anna and her family stay.
    await pages.anna!.goto("/");
    await expect(pages.anna!.getByTestId("week")).toBeVisible();
  });
});
