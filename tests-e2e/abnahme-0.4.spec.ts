import { randomBytes } from "node:crypto";
import { hash } from "@node-rs/argon2";
import { PrismaClient } from "@prisma/client";
import { expect, test, type Browser, type Page } from "@playwright/test";

// Release 0.4 acceptance against the container: family members share leisure targets (a place and a
// dated event) and filter them by category and creator; a wish list with a reservation the wishing
// person does not see; private mindfulness entries stay invisible to unauthorised people (other
// member, other family), shared ones are visible to the people they were shared with. 375 px.
// Users are created directly with a password (no sign-up). Tile requests are aborted (no load on OSM).
const run = randomBytes(4).toString("hex");
const admin = new PrismaClient({ datasourceUrl: process.env.DATABASE_ADMIN_URL });
const shots = process.env.ABNAHME_DIR ?? "test-results/abnahme-0.4";
const secret = () => randomBytes(12).toString("base64url");
const people = {
  anna: { name: "Anna Muster", email: `anna-a4-${run}@example.test`, phrase: secret() },
  ben: { name: "Ben Muster", email: `ben-a4-${run}@example.test`, phrase: secret() },
  clara: { name: "Clara Muster", email: `clara-a4-${run}@example.test`, phrase: secret() },
  dora: { name: "Dora Beispiel", email: `dora-a4-${run}@example.test`, phrase: secret() },
};
const PLACE = `Waldspielplatz ${run}`;
const EVENT = `Laternenfest ${run}`;
const CAFE = `Eiscafé ${run}`;
const LIST = `Annas Wünsche ${run}`;
const WISH = `Hängematte ${run}`;
const PRIVATE_NOTE = `Nur für mich ${run}`;
const FAMILY_NOTE = `Gut geschlafen ${run}`;
const SHARED_NOTE = `Nur für Ben ${run}`;
const pages: Record<string, Page> = {};
const families: string[] = [];

function isoDay(offset: number): string {
  const d = new Date(Date.now() + offset * 86_400_000);
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(d);
}

async function noOverflow(p: Page) {
  const { scroll, client } = await p.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  expect(scroll, `${p.url()}: ${scroll} > ${client}`).toBeLessThanOrEqual(client);
}

async function createUser(key: keyof typeof people, familyId: string, role: "OWNER" | "MEMBER") {
  const who = people[key];
  const u = await admin.user.create({ data: { id: `${key}-a4-${run}`, name: who.name, email: who.email, emailVerified: true } });
  await admin.account.create({
    data: { id: `acc-${key}-a4-${run}`, accountId: u.id, providerId: "credential", userId: u.id, password: await hash(who.phrase, { memoryCost: 19456, timeCost: 2, parallelism: 1 }) },
  });
  await admin.familyMembership.create({ data: { familyId, userId: u.id, role } });
  await admin.familyProfile.create({ data: { familyId, displayName: who.name, userId: u.id } });
}

async function signIn(browser: Browser, key: keyof typeof people): Promise<Page> {
  const who = people[key];
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
  pages[key] = p;
  return p;
}

async function addPoi(p: Page, o: { name: string; category: string; lat: string; lng: string; from?: string; to?: string }) {
  await p.goto("/karte");
  await p.getByLabel("Name", { exact: true }).fill(o.name);
  await p.locator("select[name=categoryId]").selectOption({ label: o.category });
  await p.locator("#neu-lat").fill(o.lat);
  await p.locator("#neu-lng").fill(o.lng);
  if (o.from) await p.locator("input[name=startDate]").fill(o.from);
  if (o.to) await p.locator("input[name=endDate]").fill(o.to);
  await p.getByRole("button", { name: "Ort speichern" }).click();
  await expect(p.getByRole("heading", { name: o.name })).toBeVisible();
  await expect(p.getByText("Ort gespeichert.")).toBeVisible();
}

async function filter(p: Page, o: { category?: string; creator?: string }) {
  await p.goto("/karte");
  if (o.category) await p.locator("#f-kat").selectOption({ label: o.category });
  if (o.creator) await p.locator("#f-von").selectOption({ label: o.creator });
  await p.getByRole("button", { name: "Filtern" }).click();
}

async function rate(p: Page, o: { topic: string; rating: number; note: string; visibility: string; viewer?: string }) {
  // 0.7: visibility is a setting of the user (applies to new entries), the questionnaire is one form.
  const setting = p.getByTestId("visibility-setting");
  await setting.locator("summary").click();
  await setting.getByLabel(o.visibility, { exact: true }).check();
  if (o.viewer) await setting.getByLabel(o.viewer).check();
  await setting.getByRole("button", { name: "Sichtbarkeit speichern" }).click();
  await expect(p.getByRole("status")).toHaveText("Sichtbarkeit gespeichert. Sie gilt für neue Einträge.");
  const form = p.getByRole("form", { name: "Fragebogen ausfüllen" });
  for (const t of ["Essen", "Schlaf", "Stimmung", "Arbeit", "Freizeit", "Gesundheit"]) {
    if (t !== o.topic) await form.getByLabel(`${t} bewerten`).uncheck();
  }
  const radio = form.getByLabel(new RegExp(`^${o.topic}: \\S+ ${o.rating} von 5`));
  await radio.locator("xpath=..").click();
  await expect(radio).toBeChecked();
  await form.getByText("Notiz hinzufügen (optional)").click();
  await form.getByLabel("Notiz", { exact: true }).fill(o.note);
  await form.getByRole("button", { name: "Absenden" }).click();
  await expect(p.getByRole("status")).toHaveText("Eintrag gespeichert.");
  await expect(p.getByText(o.note)).toBeVisible();
}

async function showPerson(p: Page, name: string) {
  await p.goto("/achtsamkeit");
  await p.getByRole("combobox", { name: "Person", exact: true }).selectOption({ label: name });
  await p.getByRole("button", { name: "Anzeigen" }).click();
}

test.describe.serial("Abnahme Release 0.4", () => {
  test.beforeAll(async ({ browser }) => {
    const fa = await admin.family.create({ data: { name: "Familie Muster" } });
    const fb = await admin.family.create({ data: { name: "Familie Beispiel" } });
    families.push(fa.id, fb.id);
    await createUser("anna", fa.id, "OWNER");
    await createUser("ben", fa.id, "MEMBER");
    await createUser("clara", fa.id, "MEMBER");
    await createUser("dora", fb.id, "OWNER");
    await signIn(browser, "anna");
  });

  test.afterAll(async () => {
    await Promise.all(Object.values(pages).map((p) => p.context().close()));
    await admin.family.deleteMany({ where: { id: { in: families } } });
    await admin.user.deleteMany({ where: { email: { in: Object.values(people).map((p) => p.email) } } });
    await admin.$disconnect();
  });

  test("Anna teilt einen Ausflugsort und eine Veranstaltung", async () => {
    const p = pages.anna!;
    await addPoi(p, { name: PLACE, category: "Spielplatz", lat: "50.12", lng: "8.68" });
    await noOverflow(p);
    await p.screenshot({ path: `${shots}/01-ort.png`, fullPage: true });
    await addPoi(p, { name: EVENT, category: "Veranstaltung", lat: "50.11", lng: "8.67", from: isoDay(1), to: isoDay(3) });
    await expect(p.locator("main")).toContainText("Veranstaltung");
    await noOverflow(p);
    await p.screenshot({ path: `${shots}/02-veranstaltung.png`, fullPage: true });
  });

  test("Ben sieht beides, trägt selbst einen Ort ein und filtert nach Kategorie und Ersteller", async ({ browser }) => {
    const b = await signIn(browser, "ben");
    await b.goto("/karte");
    const rows = b.getByTestId("poi-row");
    await expect(rows.filter({ hasText: PLACE })).toHaveCount(1);
    await expect(rows.filter({ hasText: EVENT })).toHaveCount(1);
    await addPoi(b, { name: CAFE, category: "Café", lat: "50.10", lng: "8.66" });

    await filter(b, { category: "Veranstaltung" });
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText(EVENT);
    await noOverflow(b);
    await b.screenshot({ path: `${shots}/03-filter-kategorie.png`, fullPage: true });

    await filter(b, { creator: "Anna Muster" });
    await expect(rows).toHaveCount(2);
    await expect(rows.filter({ hasText: CAFE })).toHaveCount(0);
    await filter(b, { creator: "Ben Muster" });
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText(CAFE);
    await b.screenshot({ path: `${shots}/04-filter-ersteller.png`, fullPage: true });

    const a = pages.anna!;
    await a.goto("/karte");
    await expect(a.getByTestId("poi-row")).toHaveCount(3);
  });

  test("Wunschzettel: Ben reserviert, Anna sieht die Reservierung nicht", async () => {
    const a = pages.anna!;
    await a.goto("/wuensche");
    const form = a.locator("form").filter({ has: a.getByRole("button", { name: "Wunschzettel anlegen" }) });
    await form.getByLabel("Name des Wunschzettels").fill(LIST);
    await form.getByLabel("Für wen?").selectOption({ label: "Anna Muster" });
    await form.getByRole("button", { name: "Wunschzettel anlegen" }).click();
    await expect(a.getByRole("heading", { name: LIST })).toBeVisible();
    const listUrl = new URL(a.url()).pathname;
    const wish = a.locator("form").filter({ has: a.getByRole("button", { name: "Wunsch speichern" }) });
    await wish.getByLabel("Wunsch", { exact: true }).fill(WISH);
    await wish.getByLabel("Priorität").selectOption({ label: "Herzenswunsch" });
    await wish.getByRole("button", { name: "Wunsch speichern" }).click();
    await expect(a.getByTestId("wish-row").filter({ hasText: WISH })).toBeVisible();

    const b = pages.ben!;
    await b.goto(listUrl);
    const row = b.getByTestId("wish-row").filter({ hasText: WISH });
    await row.getByRole("button", { name: "Ich schenke das" }).click();
    await expect(b.getByText("Reserviert. Die beschenkte Person sieht das nicht.")).toBeVisible();
    await expect(b.getByTestId("wish-row").filter({ hasText: WISH })).toContainText("Von dir reserviert");
    await noOverflow(b);
    await b.screenshot({ path: `${shots}/05-ben-reserviert.png`, fullPage: true });

    await a.goto(listUrl);
    const own = a.getByTestId("wish-row").filter({ hasText: WISH });
    await expect(own).toBeVisible();
    await expect(own).not.toContainText(/reserviert/i);
    await expect(own).not.toContainText("Ben Muster");
    await noOverflow(a);
    await a.screenshot({ path: `${shots}/06-anna-sieht-nichts.png`, fullPage: true });
  });

  test("Achtsamkeit: Anna bewertet privat, für die Familie und nur für Ben", async () => {
    const a = pages.anna!;
    await a.goto("/achtsamkeit");
    await expect(a.getByRole("heading", { name: "Achtsamkeit" })).toBeVisible();
    await rate(a, { topic: "Stimmung", rating: 2, note: PRIVATE_NOTE, visibility: "Nur ich" });
    await rate(a, { topic: "Schlaf", rating: 5, note: FAMILY_NOTE, visibility: "Ganze Familie" });
    await rate(a, { topic: "Arbeit", rating: 3, note: SHARED_NOTE, visibility: "Ausgewählte Personen", viewer: "Ben Muster" });
    await noOverflow(a);
    await a.screenshot({ path: `${shots}/07-achtsamkeit-anna.png`, fullPage: true });
  });

  test("Ben sieht Familie und Freigabe, nie den privaten Eintrag", async () => {
    const b = pages.ben!;
    await showPerson(b, "Anna Muster");
    await expect(b.getByText(FAMILY_NOTE)).toBeVisible();
    await expect(b.getByText(SHARED_NOTE)).toBeVisible();
    await expect(b.locator("body")).not.toContainText(PRIVATE_NOTE);
    await noOverflow(b);
    await b.screenshot({ path: `${shots}/08-achtsamkeit-ben.png`, fullPage: true });
  });

  test("Clara (nicht freigegeben) sieht nur den Familieneintrag", async ({ browser }) => {
    const c = await signIn(browser, "clara");
    await showPerson(c, "Anna Muster");
    await expect(c.getByText(FAMILY_NOTE)).toBeVisible();
    await expect(c.locator("body")).not.toContainText(SHARED_NOTE);
    await expect(c.locator("body")).not.toContainText(PRIVATE_NOTE);
    await noOverflow(c);
    await c.screenshot({ path: `${shots}/09-achtsamkeit-clara.png`, fullPage: true });
    // the shared map is the same for every member
    await c.goto("/karte");
    await expect(c.getByTestId("poi-row")).toHaveCount(3);
  });

  test("Andere Familie sieht nichts", async ({ browser }) => {
    const d = await signIn(browser, "dora");
    const secrets = [PLACE, EVENT, CAFE, LIST, WISH, PRIVATE_NOTE, FAMILY_NOTE, SHARED_NOTE, "Anna Muster", "Ben Muster"];
    for (const path of ["/", "/karte", "/karte?archiv=1", "/wuensche", "/achtsamkeit", "/achtsamkeit?ansicht=monat"]) {
      await d.goto(path);
      for (const s of secrets) await expect(d.locator("body"), `${path}: ${s}`).not.toContainText(s);
    }
    await d.screenshot({ path: `${shots}/10-andere-familie.png`, fullPage: true });
  });

  test("375 px ohne Überlauf", async () => {
    const p = pages.anna!;
    for (const path of ["/", "/karte", "/karte?archiv=1", "/karte/kategorien", "/wuensche", "/geburtstage", "/achtsamkeit"]) {
      await p.goto(path);
      await expect(p.locator("main")).toBeVisible();
      await noOverflow(p);
      const name = path.replace(/[^a-z]+/g, "-").replace(/^-|-$/g, "") || "start";
      await p.screenshot({ path: `${shots}/375-${name}.png`, fullPage: true });
    }
  });
});
