import { randomBytes } from "node:crypto";
import { hash } from "@node-rs/argon2";
import { PrismaClient } from "@prisma/client";
import { expect, test, type Browser, type Page } from "@playwright/test";

// Release 0.5 acceptance against the container: the optional modules (Prospekte, Abfallkalender) are
// switched on and off independently per family; switched off, their pages are gone for members; a
// missing or broken external source (an address that cannot be resolved) leaves the core functions
// working and shows a clear notice. The other family sees nothing. 375 px. No real retailer or FES
// endpoint is contacted: flyer links are only links, pickups come from an ICS file uploaded here.
// Users are created directly with a password (no sign-up).
const run = randomBytes(4).toString("hex");
const admin = new PrismaClient({ datasourceUrl: process.env.DATABASE_ADMIN_URL });
const shots = process.env.ABNAHME_DIR ?? "test-results/abnahme-0.5";
const secret = () => randomBytes(12).toString("base64url");
const people = {
  anna: { name: "Anna Muster", email: `anna-a5-${run}@example.test`, phrase: secret() },
  ben: { name: "Ben Muster", email: `ben-a5-${run}@example.test`, phrase: secret() },
  dora: { name: "Dora Beispiel", email: `dora-a5-${run}@example.test`, phrase: secret() },
};
const MARKET = `Wochenmarkt ${run}`;
const BIO = `Bioabfall ${run}`;
const REST = `Restmüll ${run}`;
const pages: Record<string, Page> = {};
const families: string[] = [];

function isoDay(offset: number): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date(Date.now() + offset * 86_400_000));
}
const icsDay = (offset: number) => isoDay(offset).replaceAll("-", "");
const ics = [
  "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Plan4JU Abnahme//DE",
  "BEGIN:VEVENT", `UID:bio-${run}`, `DTSTAMP:${icsDay(0)}T000000Z`, `DTSTART;VALUE=DATE:${icsDay(1)}`, `DTEND;VALUE=DATE:${icsDay(2)}`, `SUMMARY:${BIO}`, "END:VEVENT",
  "BEGIN:VEVENT", `UID:rest-${run}`, `DTSTAMP:${icsDay(0)}T000000Z`, `DTSTART;VALUE=DATE:${icsDay(3)}`, `DTEND;VALUE=DATE:${icsDay(4)}`, `SUMMARY:${REST}`, "END:VEVENT",
  "END:VCALENDAR", "",
].join("\r\n");

async function noOverflow(p: Page) {
  const { scroll, client } = await p.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  expect(scroll, `${p.url()}: ${scroll} > ${client}`).toBeLessThanOrEqual(client);
}

async function createUser(key: keyof typeof people, familyId: string, role: "OWNER" | "MEMBER") {
  const who = people[key];
  const u = await admin.user.create({ data: { id: `${key}-a5-${run}`, name: who.name, email: who.email, emailVerified: true } });
  await admin.account.create({
    data: { id: `acc-${key}-a5-${run}`, accountId: u.id, providerId: "credential", userId: u.id, password: await hash(who.phrase, { memoryCost: 19456, timeCost: 2, parallelism: 1 }) },
  });
  await admin.familyMembership.create({ data: { familyId, userId: u.id, role } });
  await admin.familyProfile.create({ data: { familyId, displayName: who.name, userId: u.id } });
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

async function toggle(p: Page, label: string, on: boolean) {
  await p.goto("/familie/module");
  await p.getByRole("button", { name: `${label} ${on ? "einschalten" : "ausschalten"}` }).click();
  await expect(p.getByRole("status")).toHaveText(on ? "Modul eingeschaltet." : "Modul ausgeschaltet.");
}

async function gone(p: Page, path: string) {
  const r = await p.goto(path);
  expect(r?.status(), path).toBe(404);
}

test.describe.serial("Abnahme Release 0.5", () => {
  test.beforeAll(async ({ browser }) => {
    const fa = await admin.family.create({ data: { name: "Familie Muster" } });
    const fb = await admin.family.create({ data: { name: "Familie Beispiel" } });
    families.push(fa.id, fb.id);
    await createUser("anna", fa.id, "OWNER");
    await createUser("ben", fa.id, "MEMBER");
    await createUser("dora", fb.id, "OWNER");
    await signIn(browser, "anna");
    await signIn(browser, "ben");
  });

  test.afterAll(async () => {
    await Promise.all(Object.values(pages).map((p) => p.context().close()));
    await admin.family.deleteMany({ where: { id: { in: families } } });
    await admin.user.deleteMany({ where: { email: { in: Object.values(people).map((p) => p.email) } } });
    await admin.$disconnect();
  });

  test("Zunächst ist alles aus; ein Mitglied kann nichts schalten", async () => {
    const b = pages.ben!;
    await b.goto("/familie/module");
    await expect(b.getByTestId("module-row")).toHaveCount(6);
    await expect(b.getByTestId("module-row").filter({ hasText: "Prospekte" })).toContainText("aus");
    await expect(b.getByTestId("module-row").filter({ hasText: "Abfallkalender" })).toContainText("aus");
    await expect(b.getByRole("button", { name: /einschalten/ })).toHaveCount(0);
    await expect(b.getByText("Module schalten nur Admins der Familie.")).toBeVisible();
    await noOverflow(b);
    await b.screenshot({ path: `${shots}/01-module-mitglied.png`, fullPage: true });
    await gone(b, "/einkauf/prospekte");
    await gone(b, "/kalender/abfall");
    await b.goto("/");
    await expect(b.getByRole("region", { name: "Abfuhr" })).toHaveCount(0);
  });

  test("Prospekte an: Händler-Links, Anna pflegt, Ben sieht nur Eingeblendete; Abfall bleibt aus", async () => {
    const a = pages.anna!;
    await toggle(a, "Prospekte", true);
    await a.goto("/einkauf");
    await a.getByRole("link", { name: "Prospekte" }).click();
    await expect(a.getByRole("heading", { name: "Prospekte" })).toBeVisible();
    await expect(a.getByTestId("flyer-link")).toHaveCount(5);
    await a.getByLabel("Name des Händlers").fill(MARKET);
    await a.getByLabel("Adresse der Prospektseite (https)").fill("https://markt.example.test/angebote");
    await a.getByRole("button", { name: "Hinzufügen" }).click();
    await expect(a.getByRole("status")).toHaveText("Prospekt-Link gespeichert.");
    const lidl = a.getByTestId("flyer-row").filter({ has: a.getByLabel("Name von Lidl") });
    await lidl.getByLabel("Anzeigen").uncheck();
    await lidl.getByRole("button", { name: "Lidl speichern" }).click();
    await expect(a.getByRole("status")).toHaveText("Prospekt-Link gespeichert.");
    await noOverflow(a);
    await a.screenshot({ path: `${shots}/02-prospekte-admin.png`, fullPage: true });

    const b = pages.ben!;
    await b.goto("/einkauf/prospekte");
    const links = b.getByTestId("flyer-link");
    await expect(links).toHaveCount(5);
    await expect(links.filter({ hasText: "Lidl" })).toHaveCount(0);
    await expect(links.filter({ hasText: MARKET }).getByRole("link")).toHaveAttribute("href", "https://markt.example.test/angebote");
    await expect(links.first().getByRole("link")).toHaveAttribute("rel", /noopener/);
    await expect(b.getByRole("button", { name: "Hinzufügen" })).toHaveCount(0);
    await noOverflow(b);
    await b.screenshot({ path: `${shots}/03-prospekte-mitglied.png`, fullPage: true });
    await gone(b, "/kalender/abfall");
  });

  test("Abfallkalender an: ICS-Datei als Quelle, Termine auf der Seite und in der Kachel", async () => {
    const a = pages.anna!;
    await toggle(a, "Abfallkalender", true);
    await a.goto("/kalender/quellen");
    await a.getByLabel("ICS-Datei", { exact: true }).first().setInputFiles({ name: "abfall.ics", mimeType: "text/calendar", buffer: Buffer.from(ics) });
    await a.getByLabel("Name (leer = Dateiname)").fill("Abfall");
    await a.getByRole("button", { name: "Importieren" }).click();
    await expect(a.getByText(/Kalenderdatei importiert/)).toBeVisible();
    await a.goto("/kalender");
    await a.getByRole("link", { name: "Abfallkalender" }).click();
    await expect(a.getByTestId("waste-notice")).toContainText("Noch kein Abfallkalender gewählt");
    await a.getByLabel("Abfallkalender").selectOption({ label: "Abfall" });
    await a.getByRole("button", { name: "Speichern" }).click();
    await expect(a.getByRole("status")).toHaveText("Abfallkalender gespeichert.");
    await expect(a.getByTestId("pickup")).toHaveText([new RegExp(BIO), new RegExp(REST)]);
    await noOverflow(a);
    await a.screenshot({ path: `${shots}/04-abfall.png`, fullPage: true });

    const b = pages.ben!;
    await b.goto("/");
    const tile = b.getByRole("region", { name: "Abfuhr" });
    await expect(tile).toContainText(BIO);
    await expect(tile).toContainText(REST);
    await noOverflow(b);
    await b.screenshot({ path: `${shots}/05-kachel-abfuhr.png`, fullPage: true });
    await b.goto("/kalender/abfall");
    await expect(b.getByTestId("pickup")).toHaveCount(2);
    await expect(b.getByLabel("Abfallkalender")).toHaveCount(0);
  });

  test("Kaputte Quelle: Hinweis im Modul, Kernfunktionen laufen weiter", async () => {
    const a = pages.anna!;
    await a.goto("/kalender/quellen");
    await a.getByLabel(/^Adresse/).fill(`https://abfall-${run}.invalid/termine.ics`);
    await a.getByLabel("Name", { exact: true }).last().fill("Abfall-Abo");
    await a.getByRole("button", { name: "Abonnieren" }).click();
    await expect(a.getByTestId("calendar-row").filter({ hasText: "Abfall-Abo" })).toBeVisible();
    await a.goto("/kalender/abfall");
    await a.getByLabel("Abfallkalender").selectOption({ label: "Abfall-Abo" });
    await a.getByRole("button", { name: "Speichern" }).click();
    await expect(a.getByTestId("waste-notice")).toContainText("hat nicht geklappt");
    await expect(a.getByText("Keine kommenden Abfuhrtermine")).toBeVisible();
    await a.screenshot({ path: `${shots}/06-abfall-quelle-kaputt.png`, fullPage: true });

    const b = pages.ben!;
    for (const [path, ready] of [["/", "week"], ["/kalender", "cal-week"]] as const) {
      const t = Date.now();
      await b.goto(path);
      await expect(b.getByTestId(ready)).toBeVisible();
      expect(Date.now() - t, path).toBeLessThan(8_000);
    }
    await expect(b.getByRole("region", { name: "Abfuhr" })).toHaveCount(0); // tile only on the start page
    for (const path of ["/einkauf", "/aufgaben", "/essen"]) {
      const r = await b.goto(path);
      expect(r?.status(), path).toBe(200);
      await expect(b.locator("main")).toBeVisible();
    }
    await b.goto("/");
    await expect(b.getByRole("region", { name: "Abfuhr" })).toContainText("keine Abfuhr");
  });

  test("Prospekte aus: weg für alle, Abfall bleibt an (unabhängig)", async () => {
    const a = pages.anna!;
    await toggle(a, "Prospekte", false);
    const b = pages.ben!;
    await gone(b, "/einkauf/prospekte");
    await b.goto("/einkauf");
    await expect(b.getByRole("link", { name: "Prospekte" })).toHaveCount(0);
    await b.goto("/kalender/abfall");
    await expect(b.getByRole("heading", { name: "Abfallkalender" })).toBeVisible();
    // switching back on keeps the edited list
    await toggle(a, "Prospekte", true);
    await b.goto("/einkauf/prospekte");
    await expect(b.getByTestId("flyer-link").filter({ hasText: MARKET })).toHaveCount(1);
    await expect(b.getByTestId("flyer-link").filter({ hasText: "Lidl" })).toHaveCount(0);
  });

  test("Andere Familie: eigene Schalter aus, nichts von Familie Muster", async ({ browser }) => {
    const d = await signIn(browser, "dora");
    await d.goto("/familie/module");
    await expect(d.getByTestId("module-row").filter({ hasText: "Prospekte" })).toContainText("aus");
    await expect(d.getByRole("button", { name: "Prospekte einschalten" })).toBeVisible();
    await gone(d, "/einkauf/prospekte");
    await gone(d, "/kalender/abfall");
    for (const path of ["/", "/kalender/quellen", "/einkauf"]) {
      await d.goto(path);
      for (const s of [MARKET, BIO, REST, "Abfall-Abo", "Anna Muster"]) await expect(d.locator("body"), `${path}: ${s}`).not.toContainText(s);
    }
    await d.screenshot({ path: `${shots}/07-andere-familie.png`, fullPage: true });
  });

  test("375 px ohne Überlauf", async () => {
    const p = pages.anna!;
    for (const path of ["/", "/familie/module", "/einkauf", "/einkauf/prospekte", "/kalender", "/kalender/abfall", "/kalender/quellen"]) {
      await p.goto(path);
      await expect(p.locator("main")).toBeVisible();
      await noOverflow(p);
      const name = path.replace(/[^a-z]+/g, "-").replace(/^-|-$/g, "") || "start";
      await p.screenshot({ path: `${shots}/375-${name}.png`, fullPage: true });
    }
  });
});
