import { randomBytes } from "node:crypto";
import { hash } from "@node-rs/argon2";
import { PrismaClient } from "@prisma/client";
import { expect, test, type Browser, type Page } from "@playwright/test";

// Release 0.8 acceptance against the container at 375 px (customer feedback):
// Menu: "Reminder" (Wunschzettel, POI, Achtsamkeit), "Einstellungen" (Mitglieder, Module, Feedback), calendar tabs,
// old addresses redirect. Start page: grouped task tile, Schule/Sterne off for a new family, elements per user,
// birthdays 2 days back to 3 ahead. Shopping list: categories, automatic and remembered. POI: address search
// (server endpoint mocked in the browser, no request to OpenStreetMap from a test) and "Mein Standort".
// Bell: red frame and count in the label. Users are created directly (no sign-up).
const run = randomBytes(4).toString("hex");
const admin = new PrismaClient({ datasourceUrl: process.env.DATABASE_ADMIN_URL });
const shots = process.env.ABNAHME_DIR ?? "test-results/abnahme-0.8";
const secret = () => randomBytes(12).toString("base64url");
const people = {
  anna: { name: "Anna Muster", email: `anna-a8-${run}@example.test`, phrase: secret() },
  ben: { name: "Ben Muster", email: `ben-a8-${run}@example.test`, phrase: secret() },
};
const pages: Record<string, Page> = {};
const families: string[] = [];
const ASSIGN = `Fenster putzen ${run}`;
const SPECIAL = `Hausmischung ${run}`;

async function noOverflow(p: Page) {
  const { scroll, client } = await p.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  expect(scroll, `${p.url()}: ${scroll} > ${client}`).toBeLessThanOrEqual(client);
}

async function createUser(key: keyof typeof people, familyId: string, role: "OWNER" | "MEMBER") {
  const who = people[key];
  const u = await admin.user.create({ data: { id: `${key}-a8-${run}`, name: who.name, email: who.email, emailVerified: true } });
  await admin.account.create({
    data: { id: `acc-${key}-a8-${run}`, accountId: u.id, providerId: "credential", userId: u.id, password: await hash(who.phrase, { memoryCost: 19456, timeCost: 2, parallelism: 1 }) },
  });
  await admin.familyMembership.create({ data: { familyId, userId: u.id, role } });
  await admin.familyProfile.create({ data: { familyId, displayName: who.name, userId: u.id } });
}

async function signIn(browser: Browser, key: keyof typeof people): Promise<Page> {
  const who = people[key];
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, geolocation: { latitude: 50.1, longitude: 8.6 }, permissions: ["geolocation"] });
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

/** YYYY-MM-DD in Berlin, n days from today. */
function berlinDay(n: number): { iso: string; month: number; day: number } {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(new Date());
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  const iso = d.toISOString().slice(0, 10);
  return { iso, month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

const mainNav = (p: Page) => p.locator("nav[aria-label=\"Hauptmenü\"].fixed");

test.describe.serial("Abnahme Release 0.8", () => {
  test.beforeAll(async ({ browser }) => {
    const fa = await admin.family.create({ data: { name: `Familie Muster ${run}`, timezone: "Europe/Berlin" } });
    families.push(fa.id);
    await createUser("anna", fa.id, "OWNER");
    await createUser("ben", fa.id, "MEMBER");
    const creator = `anna-a8-${run}`;
    const mk = (name: string, n: number) => {
      const d = berlinDay(n);
      return admin.birthday.create({ data: { familyId: fa.id, name: `${name} ${run}`, month: d.month, day: d.day, createdById: creator } });
    };
    await Promise.all([mk("Vorgestern", -2), mk("VorDrei", -3), mk("Heute", 0), mk("InDrei", 3), mk("InVier", 4)]);
    await signIn(browser, "anna");
    await signIn(browser, "ben");
  });

  test.afterAll(async () => {
    await Promise.all(Object.values(pages).map((p) => p.context().close()));
    await admin.family.deleteMany({ where: { id: { in: families } } });
    await admin.user.deleteMany({ where: { email: { in: Object.values(people).map((p) => p.email) } } });
    await admin.$disconnect();
  });

  test("Menü: Reminder, Optionen/Einstellungen, Kalender-Tabs; 7 Tabs einzeilig bei 375 px", async () => {
    const a = pages.anna!;
    await a.goto("/");
    const labels = await mainNav(a).locator("a span").allTextContents();
    expect(labels).toEqual(["Heute", "Kalender", "Aufgaben", "Routinen", "Essen", "Reminder", "Optionen"]);
    for (const h of await mainNav(a).locator("a span").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height))) expect(h).toBeLessThan(20);
    await noOverflow(a);

    await mainNav(a).getByRole("link", { name: "Reminder" }).click();
    const rem = a.getByRole("navigation", { name: "Bereiche von Reminder" });
    await expect(rem.getByRole("link")).toHaveText(["Wunschzettel", "POI", "Achtsamkeit"]);
    await rem.getByRole("link", { name: "Achtsamkeit" }).click();
    await expect(a.getByRole("heading", { name: "Achtsamkeit", level: 1 })).toBeVisible();
    await expect(mainNav(a).getByRole("link", { name: "Reminder" })).toHaveAttribute("aria-current", "page");
    await noOverflow(a);
    await a.screenshot({ path: `${shots}/01-reminder.png`, fullPage: true });

    await mainNav(a).getByRole("link", { name: "Optionen" }).click();
    const set = a.getByRole("navigation", { name: "Bereiche der Einstellungen" });
    await expect(set.getByRole("link")).toHaveText(["Mitglieder", "Module", "Feedback"]);
    await set.getByRole("link", { name: "Feedback" }).click();
    await expect(a.getByTestId("feedback-form")).toBeVisible();
    await expect(a.getByTestId("feedback-button")).toHaveCount(0);
    await noOverflow(a);

    await mainNav(a).getByRole("link", { name: "Kalender" }).click();
    const cal = a.getByRole("navigation", { name: "Bereiche des Kalenders" });
    await expect(cal.getByRole("link")).toHaveText(["Kalender", "Geburtstage", "Quellen"]);
    for (const [tab, heading] of [["Geburtstage", "Geburtstage"], ["Quellen", "Externe Kalender"], ["Kalender", "Kalender"]] as const) {
      await cal.getByRole("link", { name: tab }).click();
      await expect(a.getByRole("heading", { name: heading, level: 1 })).toBeVisible();
      await expect(cal.getByRole("link", { name: tab })).toHaveAttribute("aria-current", "page");
      await noOverflow(a);
    }
    await a.screenshot({ path: `${shots}/02-kalender-tabs.png`, fullPage: true });
  });

  test("Alte Adressen leiten um (Lesezeichen, Links in Benachrichtigungen)", async ({ request }) => {
    for (const [from, to] of [
      ["/geburtstage", "/kalender/geburtstage"],
      ["/familie", "/einstellungen/mitglieder"],
      ["/familie/mitglieder?ok=rolle", "/einstellungen/mitglieder?ok=rolle"],
      ["/familie/module", "/einstellungen/module"],
      ["/familie/meldungen", "/einstellungen/meldungen"],
    ]) {
      const r = await request.get(from!, { maxRedirects: 0 });
      expect(r.status(), from).toBe(307);
      expect(r.headers().location, from).toBe(to);
    }
    const a = pages.anna!;
    await a.goto("/geburtstage");
    await expect(a).toHaveURL(/\/kalender\/geburtstage$/);
    await expect(a.getByRole("heading", { name: "Geburtstage", level: 1 })).toBeVisible();
  });

  test("Startseite: Aufgaben gebündelt, Geburtstage -2 bis +3 Tage, Schule/Sterne aus, Auswahl je Nutzer", async () => {
    const a = pages.anna!;
    const b = pages.ben!;
    await a.goto("/");
    const group = a.getByTestId("tasks-group");
    await expect(group).toBeVisible();
    for (const t of ["Meine Aufgaben", "Heute fällig", "Überfällig"]) await expect(group.getByRole("region", { name: t })).toBeVisible();
    await expect(a.getByTestId("tile-soon")).toHaveCount(0);

    const bd = a.getByRole("region", { name: "Geburtstage" });
    await expect(bd.getByTestId("birthday-near")).toHaveCount(3);
    await expect(bd).toContainText(`Vorgestern ${run}`);
    await expect(bd).toContainText("vorgestern");
    await expect(bd).toContainText(`Heute ${run}`);
    await expect(bd).toContainText(`InDrei ${run}`);
    await expect(bd).not.toContainText(`VorDrei ${run}`);
    await expect(bd).not.toContainText(`InVier ${run}`);
    await noOverflow(a);
    await a.screenshot({ path: `${shots}/03-heute.png`, fullPage: true });

    // Anna switches "Schule heute" on for the family; it then appears for everyone
    await a.goto("/einstellungen/module");
    await a.getByRole("button", { name: "Schule heute einschalten" }).click();
    await expect(a.getByRole("status")).toHaveText("Modul eingeschaltet.");
    await b.goto("/");
    await expect(b.getByRole("region", { name: "Schule heute" })).toBeVisible();
    await expect(b.getByRole("region", { name: "Sterne" })).toHaveCount(0);

    // Anna hides "Diese Woche" and "Schule heute" for herself only
    await a.goto("/einstellungen/module");
    const prefs = a.getByTestId("dashboard-prefs");
    await prefs.getByLabel("Diese Woche", { exact: true }).uncheck();
    await prefs.getByLabel("Schule heute", { exact: true }).uncheck();
    await prefs.getByRole("button", { name: "Startseite speichern" }).click();
    await expect(a.getByRole("status")).toHaveText("Deine Startseite ist gespeichert.");
    await noOverflow(a);
    await a.screenshot({ path: `${shots}/04-meine-startseite.png`, fullPage: true });
    await a.goto("/");
    await expect(a.getByTestId("week")).toHaveCount(0);
    await expect(a.getByRole("region", { name: "Schule heute" })).toHaveCount(0);
    await b.goto("/");
    await expect(b.getByTestId("week")).toBeVisible();
    await expect(b.getByRole("region", { name: "Schule heute" })).toBeVisible();

    // back to the default for Anna, school off again for the family
    await a.goto("/einstellungen/module");
    await a.getByTestId("dashboard-prefs").getByLabel("Diese Woche", { exact: true }).check();
    await a.getByTestId("dashboard-prefs").getByLabel("Schule heute", { exact: true }).check();
    await a.getByRole("button", { name: "Startseite speichern" }).click();
    await a.getByRole("button", { name: "Schule heute ausschalten" }).click();
    await expect(a.getByRole("status")).toHaveText("Modul ausgeschaltet.");
    await a.goto("/");
    await expect(a.getByTestId("week")).toBeVisible();
  });

  test("Einkauf: Kategorie automatisch, sortiert, manuelle Wahl wird gemerkt", async () => {
    const a = pages.anna!;
    const add = async (name: string, category?: string) => {
      await a.goto("/einkauf");
      await a.getByText("+ Eintrag hinzufügen").click();
      const form = a.locator("details[open] form");
      await form.getByLabel("Artikel").fill(name);
      if (category) await form.getByLabel("Kategorie (optional)").selectOption({ label: category });
      await form.getByRole("button", { name: "Auf die Liste" }).click();
      await expect(a.getByRole("status")).toBeVisible();
    };
    await add("Klopapier");
    await add("Äpfel");
    await add("Rinderhack");
    await add("Orangensaft");
    await add(SPECIAL, "Gewürz");
    await add(SPECIAL); // same name, no choice: remembered
    const groups = a.getByTestId("category-group");
    expect(await groups.evaluateAll((els) => els.map((e) => e.getAttribute("data-category")))).toEqual(["FLEISCH", "OBST", "GETRAENKE", "GEWUERZ", "SONSTIGES"]);
    await expect(a.locator("[data-category=GEWUERZ] [data-testid=item-name]")).toHaveText([SPECIAL, SPECIAL]);
    await expect(a.locator("[data-category=FLEISCH] [data-testid=item-name]")).toHaveText(["Rinderhack"]);
    await expect(a.locator("[data-category=SONSTIGES] [data-testid=item-name]")).toHaveText(["Klopapier"]);
    await noOverflow(a);
    await a.screenshot({ path: `${shots}/05-einkauf.png`, fullPage: true });
  });

  test("POI: Adresssuche (ab 3 Zeichen, auf Knopf) und Mein Standort füllen die Position", async ({ request }) => {
    // the real endpoint: only with a session
    const anon = await request.get("/api/karte/suche?q=Musterstra%C3%9Fe", { maxRedirects: 0 });
    expect(anon.status()).toBe(401);
    const a = pages.anna!;
    const signedIn = await a.request.get("/api/karte/suche?q=ab");
    expect(signedIn.status()).toBe(400);
    const pp = (await a.request.get("/karte")).headers()["permissions-policy"];
    expect(pp).toContain("geolocation=(self)");

    // in the browser the endpoint is mocked: a test never sends anything to OpenStreetMap
    let asked: string | null = null;
    await a.route("**/api/karte/suche**", async (route) => {
      asked = new URL(route.request().url()).searchParams.get("q");
      await route.fulfill({ json: { results: [{ label: "Musterstraße 1, 12345 Musterstadt", lat: 50.111111, lng: 8.666666 }] } });
    });
    await a.goto("/karte?tab=neu");
    const search = a.getByTestId("address-search").first();
    await search.getByLabel("Adresse suchen").fill("Mu");
    await search.getByRole("button", { name: "Suchen" }).click();
    await expect(search.getByText("Bitte mindestens 3 Zeichen eingeben.")).toBeVisible();
    expect(asked).toBeNull();
    await search.getByLabel("Adresse suchen").fill("Musterstraße 1");
    await search.getByRole("button", { name: "Suchen" }).click();
    await search.getByTestId("address-result").click();
    expect(asked).toBe("Musterstraße 1");
    await expect(a.getByLabel("Breite (Lat)").first()).toHaveValue("50.111111");
    await expect(a.getByLabel("Länge (Lng)").first()).toHaveValue("8.666666");
    await expect(a.getByLabel("Adresse (optional, nur Text)").first()).toHaveValue("Musterstraße 1, 12345 Musterstadt");
    await expect(search).toContainText("OpenStreetMap-Mitwirkende");
    await noOverflow(a);
    await a.screenshot({ path: `${shots}/06-poi-suche.png`, fullPage: true });

    await search.getByRole("button", { name: "Mein Standort" }).click();
    await expect(a.getByLabel("Breite (Lat)").first()).toHaveValue("50.100000");
    await expect(a.getByLabel("Länge (Lng)").first()).toHaveValue("8.600000");
    await a.unroute("**/api/karte/suche**");
  });

  test("Glocke: roter Rand und Anzahl im Namen bei Ungelesenem", async () => {
    const a = pages.anna!;
    const b = pages.ben!;
    // today's birthday already made a notification: generate everything, then mark it read
    await a.goto("/benachrichtigungen");
    await admin.notification.updateMany({ where: { userId: `anna-a8-${run}`, readAt: null }, data: { readAt: new Date() } });
    await a.goto("/");
    const calm = a.locator("[data-testid=bell]:visible");
    await expect(calm).not.toHaveAttribute("data-unread", "true");
    await expect(calm).toHaveAttribute("aria-label", "Benachrichtigungen");
    await b.goto("/aufgaben?tab=neu");
    await b.getByLabel("Was ist zu tun?").fill(ASSIGN);
    await b.getByLabel("Anna Muster").check();
    await b.getByRole("button", { name: "Aufgabe anlegen" }).click();
    await expect(b.getByText("Aufgabe angelegt.")).toBeVisible();
    await a.goto("/");
    const bell = a.locator("[data-testid=bell]:visible");
    await expect(bell).toHaveAttribute("data-unread", "true");
    await expect(bell).toHaveAttribute("aria-label", /Benachrichtigungen, \d+ ungelesen/);
    expect(await bell.evaluate((e) => getComputedStyle(e).borderTopColor)).toBe("rgb(185, 28, 28)");
    await a.screenshot({ path: `${shots}/07-glocke.png` });
  });
});
