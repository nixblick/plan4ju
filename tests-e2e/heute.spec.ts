import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { localParts } from "../src/lib/tz";
import { todayIn } from "../src/lib/week";
import { createFamilyWithOwnerInvitation } from "../src/server/admin";
import { createEvent } from "../src/server/services/calendar";
import { createInvitation } from "../src/server/services/invitations";
import { listProfiles } from "../src/server/services/members";
import { createRoutine } from "../src/server/services/routines";

// Familie Muster (Anna, Ben) has an event and a routine today; Familie Beispiel (Clara) must see nothing.
const run = randomBytes(4).toString("hex");
const mail = (who: string) => `${who}-${run}@example.test`;
const secret = () => randomBytes(12).toString("base64url");
const admin = new PrismaClient({ datasourceUrl: process.env.DATABASE_ADMIN_URL });
const people = {
  anna: { name: "Anna Muster", email: mail("anna"), phrase: secret() },
  ben: { name: "Ben Muster", email: mail("ben"), phrase: secret() },
  clara: { name: "Clara Beispiel", email: mail("clara"), phrase: secret() },
};
const today = todayIn("Europe/Berlin");
const EARLY = `Zahnarzt ${run}`; // 07:00 Anna
const ROUTINE = `Kita holen ${run}`; // 18:30 Ben
const LATE = `Spätdienst ${run}`; // 23:30 Ben (outside the 6-22 h strip)
const entries = [
  { title: EARLY, start: 7 * 60 },
  { title: ROUTINE, start: 18 * 60 + 30 },
  { title: LATE, start: 23 * 60 + 30 },
];

let familyA = "";
let familyB = "";
const sessions: Record<string, Page> = {};

async function join(browser: Browser, token: string, who: { name: string; phrase: string }): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`/einladung/${token}`);
  await page.getByLabel("Dein Name").fill(who.name);
  await page.getByLabel(/^Kennwort/).fill(who.phrase);
  await page.getByRole("button", { name: "Zugang anlegen und beitreten" }).click();
  await expect(page.getByTestId("week")).toBeVisible();
  return page;
}

const row = (p: Page, person: string) => p.locator(`[data-testid="strip-row"][data-person="${person}"]`);

test.describe.serial("Dashboard: Als Nächstes, Zeitstrahl, Woche", () => {
  test.beforeAll(async ({ browser }) => {
    const a = await createFamilyWithOwnerInvitation(admin, { name: "Familie Muster", ownerEmail: people.anna.email });
    const b = await createFamilyWithOwnerInvitation(admin, { name: "Familie Beispiel", ownerEmail: people.clara.email });
    familyA = a.familyId;
    familyB = b.familyId;
    sessions.anna = await join(browser, a.token, people.anna);
    const annaUser = await admin.user.findUniqueOrThrow({ where: { email: people.anna.email } });
    const invite = await createInvitation(annaUser.id, familyA, { email: people.ben.email, role: "MEMBER" });
    sessions.ben = await join(browser, invite.token, people.ben);
    sessions.clara = await join(browser, b.token, people.clara);

    const members = await listProfiles(annaUser.id, familyA);
    const profileOf = (name: string) => members.find((m) => m.displayName === name)!.id;
    const anna = profileOf(people.anna.name);
    const ben = profileOf(people.ben.name);
    await createEvent(annaUser.id, familyA, { title: EARLY, location: "Praxis am Markt", startDate: today, startTime: "07:00", endTime: "08:00", participantIds: [anna] });
    await createEvent(annaUser.id, familyA, { title: LATE, startDate: today, startTime: "23:30", endTime: "23:45", participantIds: [ben] });
    await createRoutine(annaUser.id, familyA, { title: ROUTINE, freq: "DAILY", startDate: today, timeOfDay: "18:30", assignMode: "FIXED", assigneeIds: [ben] });
  });

  test.afterAll(async () => {
    await Promise.all(Object.values(sessions).map((p) => p.context().close()));
    await admin.family.deleteMany({ where: { id: { in: [familyA, familyB].filter(Boolean) } } });
    await admin.user.deleteMany({ where: { email: { in: Object.values(people).map((p) => p.email) } } });
    await admin.$disconnect();
  });

  test("Zeitstrahl: Termin bei Anna, Routine bei Ben, Jetzt-Linie", async () => {
    for (const who of ["anna", "ben"]) {
      const p = sessions[who]!;
      await p.goto("/");
      const strip = p.getByTestId("today-strip");
      await expect(row(p, "Anna Muster").getByTestId("strip-bar")).toHaveCount(1);
      await expect(row(p, "Anna Muster")).toContainText(EARLY);
      await expect(row(p, "Anna Muster")).not.toContainText(ROUTINE);
      await expect(row(p, "Ben Muster").getByTestId("strip-bar")).toHaveCount(1);
      await expect(row(p, "Ben Muster")).toContainText(ROUTINE);
      await expect(row(p, "Ben Muster")).not.toContainText(EARLY);
      await expect(strip).not.toContainText(LATE); // 23:30 lies outside 6-22 h
      const mins = Number(localParts(new Date(), "Europe/Berlin").time.slice(0, 2)) * 60;
      if (mins >= 6 * 60 && mins < 22 * 60) await expect(p.getByTestId("now-line")).toBeVisible();
    }
  });

  test("Als Nächstes: der nächste Eintrag nach der Uhrzeit, danach die übrigen", async () => {
    const p = sessions.anna!;
    await p.goto("/");
    const t = localParts(new Date(), "Europe/Berlin").time;
    const now = Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
    const upcoming = entries.filter((e) => e.start >= now + 1); // a minute of slack for the render
    const card = p.getByTestId("next-card");
    if (upcoming.length === 0) {
      await expect(card).toContainText("nichts mehr");
    } else {
      await expect(card.getByTestId("next-entry")).toContainText(upcoming[0]!.title);
      await expect(p.getByTestId("next-in")).toContainText(/in \d+ (Minuten?|Stunden?)/);
      await expect(card.getByTestId("after-entry")).toHaveCount(Math.min(3, upcoming.length - 1));
    }
  });

  test("Diese Woche: Termin und Routine mit Personenfarben, für beide Mitglieder gleich", async () => {
    for (const who of ["anna", "ben"]) {
      const p = sessions[who]!;
      await p.goto("/");
      const day = p.getByTestId("day-today");
      await expect(day.getByTestId("week-event").filter({ hasText: EARLY })).toBeVisible();
      await expect(day.getByTestId("week-routine").filter({ hasText: ROUTINE })).toBeVisible();
    }
  });

  test("Kacheln Essen, Schule, Sterne bleiben „kommt bald“", async () => {
    const p = sessions.anna!;
    await p.goto("/");
    await expect(p.getByTestId("tile-soon")).toHaveCount(3);
    for (const t of ["Essen heute", "Schule heute", "Sterne"]) await expect(p.getByRole("region", { name: t })).toContainText("kommt bald");
  });

  test("Andere Familie sieht nichts davon", async () => {
    const p = sessions.clara!;
    await p.goto("/");
    const body = p.locator("body");
    for (const t of [EARLY, ROUTINE, LATE, "Praxis am Markt"]) await expect(body).not.toContainText(t);
    await expect(p.getByTestId("strip-bar")).toHaveCount(0);
    await expect(p.getByTestId("next-card")).toContainText("nichts mehr");
  });

  test("375 px: gestapelt, ohne Überlauf", async () => {
    for (const who of ["anna", "clara"]) {
      const p = sessions[who]!;
      await p.setViewportSize({ width: 375, height: 800 });
      await p.goto("/");
      await expect(p.getByTestId("next-card")).toBeVisible();
      const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      const a = await p.getByTestId("next-card").boundingBox();
      const b = await p.getByTestId("today-strip").boundingBox();
      expect(b!.y).toBeGreaterThan(a!.y + a!.height - 1); // stacked, not side by side
    }
  });

  test("Anmeldung merkt sich das Gerät (signiertes Cookie, HttpOnly) und bleibt nutzbar", async ({ browser }) => {
    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    await p.goto("/anmelden");
    await p.getByLabel("E-Mail-Adresse").fill(people.anna.email);
    await p.getByLabel("Kennwort").fill(people.anna.phrase);
    await p.getByRole("button", { name: /Anmelden/ }).click();
    await expect(p.getByRole("heading", { name: "Familie wählen" })).toBeVisible();
    const dev = (await ctx.cookies()).find((c) => c.name.startsWith("p4j_dev_"));
    expect(dev?.httpOnly).toBe(true);
    expect(dev?.value).toMatch(/^[\w-]+\.\d+\.[\w-]+$/); // id.iat.mac
    expect(dev!.expires - Date.now() / 1000).toBeLessThanOrEqual(90 * 24 * 60 * 60); // at most 90 days
    await ctx.close();
  });
});
