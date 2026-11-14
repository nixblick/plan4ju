import { randomBytes } from "node:crypto";
import { hash } from "@node-rs/argon2";
import { PrismaClient } from "@prisma/client";
import { expect, test, type Browser, type Page } from "@playwright/test";

// Release 0.7 acceptance against the container at 375 px:
// Aufgaben: tabs "Neu" and "Aufgaben", "Meine" first with "Nicht zugewiesen" below, filter "Alle";
// a new assignment is marked (list and bell) and can be accepted or declined, a decline tells the assigner.
// Achtsamkeit: all topics as one compact questionnaire, one "Absenden" = one entry, visibility as a setting.
// Users are created directly (no sign-up).
const run = randomBytes(4).toString("hex");
const admin = new PrismaClient({ datasourceUrl: process.env.DATABASE_ADMIN_URL });
const shots = process.env.ABNAHME_DIR ?? "test-results/abnahme-0.7";
const secret = () => randomBytes(12).toString("base64url");
const people = {
  anna: { name: "Anna Muster", email: `anna-a7-${run}@example.test`, phrase: secret() },
  ben: { name: "Ben Muster", email: `ben-a7-${run}@example.test`, phrase: secret() },
};
const pages: Record<string, Page> = {};
const families: string[] = [];
const users: Record<string, string> = {};
const ACCEPT = `Rasen mähen ${run}`;
const DECLINE = `Keller aufräumen ${run}`;
const OWN = `Brief einwerfen ${run}`;
const FREE = `Blumen kaufen ${run}`;
const NOTE = `Ruhiger Tag ${run}`;
const q = (s: string) => `„${s}“`;

async function noOverflow(p: Page) {
  const { scroll, client } = await p.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  expect(scroll, `${p.url()}: ${scroll} > ${client}`).toBeLessThanOrEqual(client);
}

async function createUser(key: keyof typeof people, familyId: string, role: "OWNER" | "MEMBER") {
  const who = people[key];
  const u = await admin.user.create({ data: { id: `${key}-a7-${run}`, name: who.name, email: who.email, emailVerified: true } });
  await admin.account.create({
    data: { id: `acc-${key}-a7-${run}`, accountId: u.id, providerId: "credential", userId: u.id, password: await hash(who.phrase, { memoryCost: 19456, timeCost: 2, parallelism: 1 }) },
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

async function newTask(p: Page, title: string, assignees: string[]) {
  await p.goto("/aufgaben?tab=neu");
  await p.getByLabel("Was ist zu tun?").fill(title);
  for (const a of assignees) await p.getByLabel(a).check();
  await p.getByRole("button", { name: "Aufgabe anlegen" }).click();
  await expect(p.getByText("Aufgabe angelegt.")).toBeVisible();
}

const section = (p: Page, heading: RegExp) => p.locator("section").filter({ has: p.getByRole("heading", { name: heading }) });

test.describe.serial("Abnahme Release 0.7", () => {
  test.beforeAll(async ({ browser }) => {
    const fa = await admin.family.create({ data: { name: `Familie Muster ${run}`, timezone: "Europe/Berlin" } });
    families.push(fa.id);
    await createUser("anna", fa.id, "OWNER");
    await createUser("ben", fa.id, "MEMBER");
    await signIn(browser, "anna");
    await signIn(browser, "ben");
  });

  test.afterAll(async () => {
    await Promise.all(Object.values(pages).map((p) => p.context().close()));
    await admin.family.deleteMany({ where: { id: { in: families } } });
    await admin.user.deleteMany({ where: { email: { in: Object.values(people).map((p) => p.email) } } });
    await admin.$disconnect();
  });

  test("Aufgaben: Tabs Neu und Aufgaben, Meine zuerst, Nicht zugewiesen darunter, Filter Alle", async () => {
    const a = pages.anna!;
    await a.goto("/aufgaben");
    const tabs = a.getByRole("navigation", { name: "Aufgaben", exact: true });
    await expect(tabs.getByRole("link")).toHaveText(["Neu", "Aufgaben"]);
    await expect(tabs.getByRole("link", { name: "Aufgaben" })).toHaveAttribute("aria-current", "page");
    for (const l of await tabs.getByRole("link").all()) expect((await l.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await tabs.getByRole("link", { name: "Neu" }).click();
    await expect(a.getByRole("button", { name: "Aufgabe anlegen" })).toBeVisible();
    await noOverflow(a);
    await a.screenshot({ path: `${shots}/01-aufgaben-neu.png`, fullPage: true });

    await newTask(a, OWN, ["Anna Muster"]);
    await newTask(a, FREE, []);
    await newTask(a, ACCEPT, ["Ben Muster"]);
    await newTask(a, DECLINE, ["Ben Muster"]);
    // back on the list: own first, unassigned below; Ben's tasks only under "Alle"
    await expect(section(a, /^Meine/)).toContainText(OWN);
    await expect(section(a, /^Nicht zugewiesen/)).toContainText(FREE);
    await expect(a.locator("body")).not.toContainText(ACCEPT);
    await a.getByRole("navigation", { name: "Aufgaben filtern" }).getByRole("link", { name: "Alle" }).click();
    await expect(a.getByTestId("task-row").filter({ hasText: ACCEPT })).toContainText("Ben Muster");
    // Anna assigned herself: nothing to accept
    await expect(a.getByTestId("pending-badge")).toHaveCount(0);
    await noOverflow(a);
  });

  test("Ben sieht die Markierung in Liste und Glocke, nimmt an und lehnt ab", async () => {
    const b = pages.ben!;
    await b.goto("/aufgaben");
    await expect(b.locator("[data-testid=bell-count]:visible")).toHaveText("2");
    const acc = b.getByTestId("task-row").filter({ hasText: ACCEPT });
    const dec = b.getByTestId("task-row").filter({ hasText: DECLINE });
    await expect(acc.getByTestId("pending-badge")).toHaveText("Neu zugewiesen");
    await expect(dec.getByTestId("pending-badge")).toBeVisible();
    for (const btn of await acc.getByRole("button").all()) expect((await btn.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await noOverflow(b);
    await b.screenshot({ path: `${shots}/02-ben-neu-zugewiesen.png`, fullPage: true });

    await b.getByRole("button", { name: `${q(ACCEPT)} annehmen` }).click();
    await expect(b.getByText("Aufgabe angenommen.")).toBeVisible();
    await expect(b.getByTestId("task-row").filter({ hasText: ACCEPT }).getByTestId("pending-badge")).toHaveCount(0);

    // the bell leads to the task page, decline from there
    await b.goto("/benachrichtigungen");
    await b.getByRole("button", { name: new RegExp(`Neu für dich: ${DECLINE}`) }).click();
    await expect(b.getByRole("heading", { name: "Neu zugewiesen" })).toBeVisible();
    await noOverflow(b);
    await b.getByRole("button", { name: `${q(DECLINE)} ablehnen` }).click();
    await expect(b.getByText(/Aufgabe abgelehnt/)).toBeVisible();
    await expect(b.getByRole("heading", { name: "Neu zugewiesen" })).toHaveCount(0);
    await b.goto("/aufgaben");
    await expect(section(b, /^Meine/)).toContainText(ACCEPT);
    await expect(section(b, /^Meine/)).not.toContainText(DECLINE);
    await expect(section(b, /^Nicht zugewiesen/)).toContainText(DECLINE);
    await b.screenshot({ path: `${shots}/03-ben-nach-antwort.png`, fullPage: true });
  });

  test("Anna bekommt die Ablehnung als Benachrichtigung", async () => {
    const a = pages.anna!;
    await a.goto("/aufgaben");
    await expect(section(a, /^Nicht zugewiesen/)).toContainText(DECLINE);
    await a.goto("/benachrichtigungen");
    await expect(a.getByText(`Ben Muster hat abgelehnt: ${DECLINE}`)).toBeVisible();
    await noOverflow(a);
    await a.screenshot({ path: `${shots}/04-anna-ablehnung.png`, fullPage: true });
  });

  test("Achtsamkeit: alle Themen untereinander, ein Absenden, Sichtbarkeit als Einstellung", async () => {
    const a = pages.anna!;
    await a.goto("/achtsamkeit");
    const form = a.getByRole("form", { name: "Fragebogen ausfüllen" });
    await expect(form.getByTestId("topic-row")).toHaveCount(6);
    for (const t of ["Essen", "Schlaf", "Stimmung", "Arbeit", "Freizeit", "Gesundheit"]) await expect(form.getByLabel(`${t} bewerten`)).toBeChecked();
    // Only person and date are selects; no topic select and no visibility in the form.
    await expect(form.getByRole("combobox")).toHaveCount(1);
    await expect(form.getByLabel("Datum")).toBeVisible();
    await expect(form.getByRole("radio", { name: "Nur ich" })).toHaveCount(0);
    await noOverflow(a);
    await a.screenshot({ path: `${shots}/05-achtsamkeit-fragebogen.png`, fullPage: true });

    // Setting: whole family. Health stays private.
    const setting = a.getByTestId("visibility-setting");
    await expect(setting).toContainText("Sichtbar für: Nur ich");
    await setting.locator("summary").click();
    await setting.getByLabel("Ganze Familie", { exact: true }).check();
    await setting.getByRole("button", { name: "Sichtbarkeit speichern" }).click();
    await expect(a.getByTestId("visibility-setting")).toContainText("Sichtbar für: Ganze Familie");

    const pick = async (topic: string, r: number) => {
      const radio = form.getByLabel(new RegExp(`^${topic}: \\S+ ${r} von 5`));
      await radio.locator("xpath=..").click();
      await expect(radio).toBeChecked();
    };
    await pick("Stimmung", 4);
    await pick("Schlaf", 2);
    await pick("Gesundheit", 3);
    await pick("Essen", 5);
    await form.getByLabel("Essen bewerten").uncheck(); // opted out: not saved although rated
    await form.getByText("Notiz hinzufügen (optional)").click();
    await form.getByLabel("Notiz", { exact: true }).fill(NOTE);
    await form.getByRole("button", { name: "Absenden" }).click();
    await expect(a.getByRole("status")).toHaveText("Eintrag gespeichert.");
    const entry = a.getByTestId("checkin").filter({ hasText: NOTE });
    await expect(entry).toHaveCount(1);
    await expect(entry.getByRole("listitem")).toHaveCount(3);
    await expect(entry).toContainText("Stimmung");
    await expect(entry).not.toContainText("Essen");
    await noOverflow(a);
    await a.screenshot({ path: `${shots}/06-achtsamkeit-eintrag.png`, fullPage: true });

    // Nothing rated: a clear message, nothing saved
    await a.goto("/achtsamkeit");
    await a.getByRole("form", { name: "Fragebogen ausfüllen" }).getByRole("button", { name: "Absenden" }).click();
    await expect(a.getByText(/mindestens ein Thema bewerten/)).toBeVisible();
  });

  test("Ben sieht Stimmung und Schlaf, nie Gesundheit", async () => {
    const b = pages.ben!;
    await b.goto("/achtsamkeit");
    await b.getByRole("combobox", { name: "Person", exact: true }).selectOption({ label: "Anna Muster" });
    await b.getByRole("button", { name: "Anzeigen" }).click();
    const entry = b.getByTestId("checkin").filter({ hasText: NOTE });
    await expect(entry.getByRole("listitem")).toHaveCount(2);
    await expect(entry).not.toContainText("Gesundheit");
    await expect(b.getByText("Löschen …")).toHaveCount(0);
    await noOverflow(b);
  });
});
