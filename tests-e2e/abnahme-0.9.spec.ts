import { randomBytes } from "node:crypto";
import { hash } from "@node-rs/argon2";
import { PrismaClient } from "@prisma/client";
import { expect, test, type Browser, type Page } from "@playwright/test";

// Release 0.9 acceptance at 375 px (customer feedback): POI in two tabs, start page order per user (default: meals
// above tasks), three more mindfulness topics and the circle symbol, deleting a routine, sharing a wish list with
// people without an account. Users are created directly (no sign-up); tile requests are aborted.
const run = randomBytes(4).toString("hex");
const admin = new PrismaClient({ datasourceUrl: process.env.DATABASE_ADMIN_URL });
const shots = process.env.ABNAHME_DIR ?? "test-results/abnahme-0.9";
const secret = () => randomBytes(12).toString("base64url");
const people = {
  anna: { name: "Anna Muster", email: `anna-a9-${run}@example.test`, phrase: secret() },
  ben: { name: "Ben Muster", email: `ben-a9-${run}@example.test`, phrase: secret() },
};
const pages: Record<string, Page> = {};
const families: string[] = [];
const ROUTINE = `Blumen gießen ${run}`;
const WISH = `Roller ${run}`;
const NOTE = `Interne Notiz ${run}`;

async function noOverflow(p: Page) {
  const { scroll, client } = await p.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  expect(scroll, `${p.url()}: ${scroll} > ${client}`).toBeLessThanOrEqual(client);
}

async function createUser(key: keyof typeof people, familyId: string, role: "OWNER" | "MEMBER") {
  const who = people[key];
  const u = await admin.user.create({ data: { id: `${key}-a9-${run}`, name: who.name, email: who.email, emailVerified: true } });
  await admin.account.create({
    data: { id: `acc-${key}-a9-${run}`, accountId: u.id, providerId: "credential", userId: u.id, password: await hash(who.phrase, { memoryCost: 19456, timeCost: 2, parallelism: 1 }) },
  });
  await admin.familyMembership.create({ data: { familyId, userId: u.id, role } });
  return admin.familyProfile.create({ data: { familyId, displayName: who.name, userId: u.id } });
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

const elementOrder = (p: Page) => p.locator("[data-element]").evaluateAll((els) => els.map((e) => e.getAttribute("data-element")));

test.describe.serial("Abnahme Release 0.9", () => {
  test.beforeAll(async ({ browser }) => {
    const fa = await admin.family.create({ data: { name: `Familie Muster ${run}`, timezone: "Europe/Berlin" } });
    families.push(fa.id);
    const anna = await createUser("anna", fa.id, "OWNER");
    await createUser("ben", fa.id, "MEMBER");
    const list = await admin.wishlist.create({ data: { familyId: fa.id, profileId: anna.id, title: `Annas Liste ${run}`, createdById: `anna-a9-${run}` } });
    const w = await admin.wish.create({ data: { familyId: fa.id, listId: list.id, title: WISH, note: NOTE, url: "https://example.test/roller", priority: 1, createdById: `anna-a9-${run}` } });
    await admin.wishReservation.create({ data: { familyId: fa.id, wishId: w.id, reservedById: `ben-a9-${run}` } });
    await signIn(browser, "anna");
    await signIn(browser, "ben");
  });

  test.afterAll(async () => {
    await Promise.all(Object.values(pages).map((p) => p.context().close()));
    await admin.family.deleteMany({ where: { id: { in: families } } });
    await admin.user.deleteMany({ where: { email: { in: Object.values(people).map((p) => p.email) } } });
    await admin.$disconnect();
  });

  test("POI: Karte mit Liste darunter, Neuer Ort mit Suche, Karte, Feldern", async () => {
    const a = pages.anna!;
    await a.goto("/karte");
    const tabs = a.getByTestId("karte-tabs");
    await expect(tabs.getByRole("link", { name: "Karte und Liste" })).toHaveAttribute("aria-current", "page");
    await expect(a.locator("#f-kat")).toBeVisible();
    await expect(a.getByRole("button", { name: "Ort speichern" })).toHaveCount(0);
    await noOverflow(a);
    await tabs.getByRole("link", { name: "Neuer Ort" }).click();
    const top = async (sel: ReturnType<Page["locator"]>) => (await sel.boundingBox())!.y;
    expect(await top(a.getByTestId("address-search").first())).toBeLessThan(await top(a.getByTestId("karte")));
    expect(await top(a.getByTestId("karte"))).toBeLessThan(await top(a.getByLabel("Name", { exact: true })));
    await a.getByTestId("karte").click({ position: { x: 150, y: 120 } });
    await expect(a.locator("#neu-lat")).not.toHaveValue("");
    await a.getByLabel("Name", { exact: true }).fill(`Spielplatz ${run}`);
    await a.locator("select[name=categoryId]").selectOption({ label: "Spielplatz" });
    await noOverflow(a);
    await a.screenshot({ path: `${shots}/01-neuer-ort.png`, fullPage: true });
    await a.getByRole("button", { name: "Ort speichern" }).click();
    await expect(a.getByText("Ort gespeichert.")).toBeVisible();
    await a.goto("/karte");
    expect((await a.getByTestId("poi-row").first().boundingBox())!.y).toBeGreaterThan(await top(a.getByTestId("karte")));
    await a.screenshot({ path: `${shots}/02-karte-liste.png`, fullPage: true });
  });

  test("Heute: Essen standardmäßig über den Aufgaben, Reihenfolge je Nutzer per Knopf", async () => {
    const a = pages.anna!;
    await a.goto("/");
    let order = await elementOrder(a);
    expect(order.indexOf("tasks") - order.indexOf("meals")).toBe(1);
    await a.goto("/einstellungen/module");
    const prefs = a.getByTestId("dashboard-prefs");
    await expect(prefs.getByRole("button", { name: "Als Nächstes nach oben" })).toHaveCount(0);
    await prefs.getByRole("button", { name: "Essen heute nach oben" }).click();
    await expect(a.getByText("Reihenfolge gespeichert.")).toBeVisible();
    await a.getByTestId("dashboard-prefs").getByRole("button", { name: "Essen heute nach oben" }).click();
    await a.getByTestId("dashboard-prefs").getByRole("button", { name: "Aufgaben (Meine, Heute fällig, Überfällig) nach oben" }).focus();
    await a.keyboard.press("Enter");
    await expect(a.getByText("Reihenfolge gespeichert.")).toBeVisible();
    await noOverflow(a);
    await a.screenshot({ path: `${shots}/03-startseite-reihenfolge.png`, fullPage: true });
    await a.goto("/");
    order = await elementOrder(a);
    expect(order.indexOf("meals")).toBeLessThan(order.indexOf("routines"));
    expect(order.indexOf("tasks")).toBeLessThan(order.indexOf("routines"));
    // Ben keeps the default
    const b = pages.ben!;
    await b.goto("/");
    const bo = await elementOrder(b);
    expect(bo.indexOf("tasks") - bo.indexOf("meals")).toBe(1);
  });

  test("Achtsamkeit: neue Themen, Farbkreise mit Zahl und Text", async () => {
    const a = pages.anna!;
    await a.goto("/achtsamkeit");
    const form = a.getByRole("form", { name: "Fragebogen ausfüllen" });
    await expect(form.getByTestId("topic-row")).toHaveCount(9);
    for (const t of ["Bewegung", "Frische Luft", "Soziale Kontakte"]) await expect(form.getByText(t, { exact: true })).toBeVisible();
    await a.getByRole("button", { name: "Farbkreise" }).click();
    await expect(a.getByText("Symbol gespeichert.")).toBeVisible();
    await expect(a.getByRole("button", { name: "Farbkreise" })).toHaveAttribute("aria-pressed", "true");
    await expect(a.getByRole("form", { name: "Fragebogen ausfüllen" }).getByTestId("rating-circle")).toHaveCount(45);
    const f2 = a.getByRole("form", { name: "Fragebogen ausfüllen" });
    await f2.getByLabel("Bewegung: 5 von 5 (super)").check({ force: true });
    await f2.getByLabel("Frische Luft: 1 von 5 (schlecht)").check({ force: true });
    await noOverflow(a);
    await a.screenshot({ path: `${shots}/04-achtsamkeit-kreise.png`, fullPage: true });
    await f2.getByRole("button", { name: "Absenden" }).click();
    await expect(a.getByText("Gespeichert", { exact: false }).first()).toBeVisible();
    await expect(a.getByTestId("checkin").first().getByLabel("Bewegung: 5 von 5 (super)")).toBeVisible();
    // Ben still sees emojis
    const b = pages.ben!;
    await b.goto("/achtsamkeit");
    await expect(b.getByRole("button", { name: "Emojis" })).toHaveAttribute("aria-pressed", "true");
    await expect(b.getByTestId("rating-circle")).toHaveCount(1); // only the preview in the "Farbkreise" button
  });

  test("Routine löschen mit Bestätigung", async () => {
    const a = pages.anna!;
    const r = await admin.routine.create({ data: { familyId: families[0]!, title: ROUTINE, startDate: new Date("2026-11-01"), createdById: `anna-a9-${run}` } });
    await admin.routineOccurrence.create({ data: { familyId: families[0]!, routineId: r.id, date: new Date("2026-11-02"), status: "DONE" } });
    await a.goto(`/routinen/${r.id}`);
    const box = a.getByTestId("routine-delete");
    await expect(box.getByRole("button", { name: "Endgültig löschen" })).toBeHidden();
    await box.getByText("Löschen …").click();
    await noOverflow(a);
    await a.screenshot({ path: `${shots}/05-routine-loeschen.png`, fullPage: true });
    await box.getByRole("button", { name: "Endgültig löschen" }).click();
    await expect(a.getByText("Routine gelöscht.")).toBeVisible();
    await expect(a.getByText(ROUTINE)).toHaveCount(0);
    expect(await admin.routine.count({ where: { id: r.id } })).toBe(0);
    expect((await a.goto(`/routinen/${r.id}`))?.status()).toBe(404);
  });

  test("Wunschzettel per Link teilen: ohne Konto, nur lesend, widerrufbar", async ({ browser }) => {
    const a = pages.anna!;
    await a.goto("/wuensche");
    await a.getByTestId("wishlist-row").first().getByRole("link").click();
    const card = a.getByTestId("share-card");
    await card.getByRole("button", { name: "Link zum Teilen erzeugen" }).click();
    const url = await a.getByLabel("Link zum Wunschzettel").inputValue();
    expect(url).toMatch(/\/geteilt\/wunschzettel\/[A-Za-z0-9_-]{43}$/);
    await noOverflow(a);
    await a.screenshot({ path: `${shots}/06-teilen.png`, fullPage: true });

    const anon = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const v = await anon.newPage();
    const path = new URL(url).pathname;
    const res = await v.goto(path);
    expect(res?.status()).toBe(200);
    expect(res?.headers()["x-robots-tag"]).toContain("noindex");
    expect(res?.headers()["cache-control"]).toContain("no-store");
    await expect(v.getByRole("heading", { name: "Wunschzettel von Anna" })).toBeVisible();
    await expect(v.getByTestId("shared-wish")).toHaveCount(1);
    await expect(v.getByTestId("shared-wish").first()).toContainText(WISH);
    const body = await v.locator("body").innerText();
    for (const leak of [NOTE, "Ben", "Muster", "reserviert", `Annas Liste ${run}`]) expect(body).not.toContain(leak);
    expect(await v.locator("script").count()).toBe(0);
    await noOverflow(v);
    await v.screenshot({ path: `${shots}/07-geteilt-ohne-konto.png`, fullPage: true });

    // a new link invalidates the old one, revoking ends it
    await a.getByTestId("share-card").getByRole("button", { name: "Neuen Link erzeugen (alter wird ungültig)" }).click();
    await expect(a.getByLabel("Link zum Wunschzettel")).not.toHaveValue(url);
    const url2 = await a.getByLabel("Link zum Wunschzettel").inputValue();
    expect((await v.goto(path))?.status()).toBe(404);
    expect((await v.goto(new URL(url2).pathname))?.status()).toBe(200);
    await a.reload();
    await a.getByTestId("share-card").getByRole("button", { name: "Link widerrufen" }).click();
    await expect(a.getByText("Link widerrufen.", { exact: false })).toBeVisible();
    expect((await v.goto(new URL(url2).pathname))?.status()).toBe(404);
    // Ben (no edit right) sees no share card
    const b = pages.ben!;
    await b.goto(a.url().split("?")[0]!);
    await expect(b.getByTestId("share-card")).toHaveCount(0);
    await anon.close();
  });
});
