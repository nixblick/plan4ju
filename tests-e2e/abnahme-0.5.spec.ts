import { randomBytes } from "node:crypto";
import { hash } from "@node-rs/argon2";
import { PrismaClient } from "@prisma/client";
import { expect, test, type Browser, type Page } from "@playwright/test";

// Release 0.5 acceptance against the container: the optional modules (Prospekte, Abfallkalender) are
// switched on and off independently per family; switched off, their pages are gone for members; a
// missing or broken external source (an address that cannot be resolved) leaves the core functions
// working and shows a clear notice. The other family sees nothing. 375 px. No real retailer or FES
// endpoint is contacted: flyer links are only links, pickups come from an ICS file uploaded here.
// Since 0.5.2/0.5.3 also: the core modules (Karte, Wunschzettel, Achtsamkeit, Essen) switch off
// without hurting the core; notifications for a due task and a birthday; the private ICS feed
// carries only the own family's dates and is revocable.
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
const TASK = `Fahrrad flicken ${run}`;
const BDAY = `Opa Muster ${run}`;
const EVENT_A = `Laternenumzug ${run}`;
const EVENT_B = `Elternabend Beispiel ${run}`;
const CORE = ["Karte", "Wunschzettel", "Achtsamkeit", "Essen und Rezepte"];
const pages: Record<string, Page> = {};
const families: string[] = [];
const profiles: Record<string, string> = {};

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
  profiles[key] = (await admin.familyProfile.create({ data: { familyId, displayName: who.name, userId: u.id } })).id;
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

  test("Kernmodule schaltbar: Karte, Wunschzettel, Achtsamkeit, Essen aus; Kern läuft, andere Familie unberührt", async ({ browser }) => {
    const a = pages.anna!;
    await a.goto("/familie/module");
    for (const label of CORE) {
      await a.getByRole("button", { name: `${label} ausschalten` }).click();
      await expect(a.getByRole("status")).toHaveText("Modul ausgeschaltet.");
    }
    const b = pages.ben!;
    for (const path of ["/karte", "/wuensche", "/achtsamkeit", "/essen", "/rezepte"]) await gone(b, path);
    for (const path of ["/", "/kalender", "/aufgaben", "/einkauf", "/geburtstage"]) {
      const r = await b.goto(path);
      expect(r?.status(), path).toBe(200);
      await expect(b.locator("main")).toBeVisible();
    }
    await b.goto("/");
    await expect(b.getByTestId("week")).toBeVisible();
    await expect(b.getByRole("region", { name: "Essen heute" })).toHaveCount(0);
    await noOverflow(b);
    await b.screenshot({ path: `${shots}/08-kernmodule-aus.png`, fullPage: true });
    // Familie Beispiel keeps its modules.
    const d = pages.dora ?? (await signIn(browser, "dora"));
    expect((await d.goto("/karte"))?.status()).toBe(200);
    await a.goto("/familie/module");
    for (const label of CORE) {
      await a.getByRole("button", { name: `${label} einschalten` }).click();
      await expect(a.getByRole("status")).toHaveText("Modul eingeschaltet.");
    }
    expect((await b.goto("/karte"))?.status()).toBe(200);
  });

  test("Benachrichtigungen: fällige Aufgabe und Geburtstag, nur für Ben, nicht für Familie Beispiel", async () => {
    const fa = families[0]!;
    const today = isoDay(0);
    await admin.task.create({
      data: { familyId: fa, title: TASK, dueDate: new Date(`${today}T00:00:00Z`), createdById: `anna-a5-${run}`, assignments: { create: { profileId: profiles.ben!, familyId: fa } } },
    });
    const [, m, d] = isoDay(1).split("-").map(Number) as [number, number, number];
    await admin.birthday.create({ data: { familyId: fa, name: BDAY, month: m, day: d, createdById: `anna-a5-${run}` } });
    const b = pages.ben!;
    // Rows written straight into the database bypass the app's change mark: since 0.7.2 the bell picks them up
    // within 5 minutes, the notifications page at once (docs/benachrichtigungen.md).
    await b.goto("/benachrichtigungen");
    await expect(b.getByRole("button", { name: new RegExp(`Heute fällig: ${TASK}`) })).toBeVisible();
    await expect(b.getByText(`Morgen hat ${BDAY} Geburtstag`)).toBeVisible();
    await b.goto("/");
    await expect(b.locator("[data-testid=bell-count]:visible")).toBeVisible();
    await b.goto("/benachrichtigungen");
    await noOverflow(b);
    await b.screenshot({ path: `${shots}/09-benachrichtigungen.png`, fullPage: true });
    const dp = pages.dora!;
    await dp.goto("/benachrichtigungen");
    await expect(dp.locator("main")).toBeVisible();
    for (const s of [TASK, BDAY]) await expect(dp.locator("body")).not.toContainText(s);
  });

  test("Privater Kalender-Feed: nur eigene Familientermine, widerrufbar", async ({ request }) => {
    const [fa, fb] = families as [string, string];
    for (const [familyId, title, by] of [[fa, EVENT_A, "anna"], [fb, EVENT_B, "dora"]] as const) {
      await admin.calendarEvent.create({
        data: { familyId, title, allDay: true, startDate: new Date(`${isoDay(2)}T00:00:00Z`), endDate: new Date(`${isoDay(2)}T00:00:00Z`), createdById: `${by}-a5-${run}` },
      });
    }
    const b = pages.ben!;
    await b.goto("/benachrichtigungen/einstellungen");
    await b.getByRole("button", { name: "Kalender-Link erzeugen" }).click();
    const url = await b.getByLabel("Kalender-Link").inputValue();
    expect(url).toMatch(/\/api\/kalender\/feed\/[A-Za-z0-9_-]{43}\.ics$/);
    await noOverflow(b);
    await b.screenshot({ path: `${shots}/10-kalender-link.png`, fullPage: true });
    const path = new URL(url).pathname;
    const res = await request.get(path);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("text/calendar");
    const body = await res.text();
    expect(body).toContain(`SUMMARY:${EVENT_A}`);
    expect(body).toContain(`SUMMARY:Geburtstag: ${BDAY}`);
    expect(body).not.toContain(EVENT_B);
    expect(body).not.toContain("Dora");
    await b.reload();
    await b.getByRole("button", { name: "Link widerrufen" }).click();
    await expect(b.getByText(/Kalender-Link widerrufen/)).toBeVisible();
    expect((await request.get(path)).status()).toBe(404);
  });

  test("375 px ohne Überlauf", async () => {
    const p = pages.anna!;
    for (const path of ["/", "/familie/module", "/einkauf", "/einkauf/prospekte", "/kalender", "/kalender/abfall", "/kalender/quellen", "/benachrichtigungen", "/benachrichtigungen/einstellungen"]) {
      await p.goto(path);
      await expect(p.locator("main")).toBeVisible();
      await noOverflow(p);
      const name = path.replace(/[^a-z]+/g, "-").replace(/^-|-$/g, "") || "start";
      await p.screenshot({ path: `${shots}/375-${name}.png`, fullPage: true });
    }
  });
});
