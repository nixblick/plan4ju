import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { admin, app, cleanup, seed, type Fixture } from "./helpers";
import { ForbiddenError, NotFoundError } from "../src/server/errors";
import { resetRateLimits } from "../src/server/ratelimit";
import { FetchError, type Resolver, type Transport } from "../src/server/safe-fetch";
import {
  createRecipe, deleteRecipe, getRecipe, importRecipeDraft, listRecipes, RecipeImportError, updateRecipe,
} from "../src/server/services/recipes";

let f: Fixture;
beforeAll(async () => {
  f = await seed();
});
afterAll(async () => {
  await cleanup(f);
  await app.$disconnect();
  await admin.$disconnect();
});
beforeEach(() => resetRateLimits());

const base = {
  title: "Nudelauflauf",
  servings: 4,
  prepMinutes: 40,
  ingredients: [
    { quantity: 500, unit: "g", name: "Nudeln" },
    { quantity: null, unit: null, name: "Salz" },
  ],
  steps: ["Nudeln kochen.", " ", "Überbacken."],
  tags: ["Auflauf", "Auflauf", ""],
  sourceUrl: "https://rezepte.example.test/auflauf",
};

describe("recipes service", () => {
  it("create, read, update, delete in the own family", async () => {
    const { id } = await createRecipe(f.userA, f.familyA, base, app);
    const r = await getRecipe(f.userA, f.familyA, id, app);
    expect(r.steps).toEqual(["Nudeln kochen.", "Überbacken."]);
    expect(r.tags).toEqual(["Auflauf"]);
    expect(r.ingredients.map((i) => [i.position, i.quantity, i.unit, i.name])).toEqual([[0, 500, "g", "Nudeln"], [1, null, null, "Salz"]]);
    expect(r.createdById).toBe(f.userA);

    await updateRecipe(f.userA, f.familyA, id, { ...base, title: "Auflauf neu", ingredients: [{ quantity: 1, unit: "kg", name: "Nudeln" }] }, app);
    const u = await getRecipe(f.userA, f.familyA, id, app);
    expect(u.title).toBe("Auflauf neu");
    expect(u.ingredients).toHaveLength(1);

    expect((await listRecipes(f.userA, f.familyA, app)).map((x) => x.id)).toEqual([id]);
    await deleteRecipe(f.userA, f.familyA, id, app);
    expect(await admin.recipeIngredient.count({ where: { recipeId: id } })).toBe(0);
  });

  it("refuses links other than https", async () => {
    await expect(createRecipe(f.userA, f.familyA, { ...base, imageUrl: "javascript:alert(1)" }, app)).rejects.toThrow();
    await expect(createRecipe(f.userA, f.familyA, { ...base, sourceUrl: "http://rezepte.example.test/" }, app)).rejects.toThrow();
  });

  it("foreign recipe by id: read, update, delete give NotFound and change nothing", async () => {
    await expect(getRecipe(f.userA, f.familyA, f.recipeB, app)).rejects.toBeInstanceOf(NotFoundError);
    await expect(updateRecipe(f.userA, f.familyA, f.recipeB, base, app)).rejects.toBeInstanceOf(NotFoundError);
    await expect(deleteRecipe(f.userA, f.familyA, f.recipeB, app)).rejects.toBeInstanceOf(NotFoundError);
    const r = await admin.recipe.findUniqueOrThrow({ where: { id: f.recipeB }, include: { ingredients: true } });
    expect(r.title).toBe("Geheimes Rezept B");
    expect(r.ingredients).toHaveLength(1);
    expect(await listRecipes(f.userA, f.familyA, app)).not.toContainEqual(expect.objectContaining({ id: f.recipeB }));
  });

  it("non-members cannot act in the family", async () => {
    await expect(listRecipes(f.userA, f.familyB, app)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(createRecipe(f.userNone, f.familyA, base, app)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("recipe RLS", () => {
  function raw<T>(familyId: string, userId: string, fn: (tx: Parameters<Parameters<typeof app.$transaction>[0]>[0]) => Promise<T>) {
    return app.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.user_id', ${userId}, true)`;
      await tx.$executeRaw`SELECT set_config('app.family_id', ${familyId}, true)`;
      return fn(tx);
    });
  }

  it("family A sees no recipe or ingredient of B, even without a filter", async () => {
    await raw(f.familyA, f.userA, async (tx) => {
      expect(await tx.recipe.findUnique({ where: { id: f.recipeB } })).toBeNull();
      expect(await tx.recipeIngredient.findMany({ where: { recipeId: f.recipeB } })).toHaveLength(0);
      expect((await tx.recipe.updateMany({ where: { id: f.recipeB }, data: { title: "gehackt" } })).count).toBe(0);
      expect((await tx.recipeIngredient.deleteMany({ where: { recipeId: f.recipeB } })).count).toBe(0);
    });
  });

  it("an ingredient cannot be attached to a foreign recipe (neither with own nor foreign familyId)", async () => {
    await expect(
      raw(f.familyA, f.userA, (tx) => tx.recipeIngredient.create({ data: { familyId: f.familyA, recipeId: f.recipeB, position: 9, name: "Gift" } })),
    ).rejects.toThrow();
    await expect(
      raw(f.familyA, f.userA, (tx) => tx.recipeIngredient.create({ data: { familyId: f.familyB, recipeId: f.recipeB, position: 9, name: "Gift" } })),
    ).rejects.toThrow();
    await expect(
      raw(f.familyA, f.userA, (tx) => tx.recipe.create({ data: { familyId: f.familyB, title: "x", createdById: f.userA } })),
    ).rejects.toThrow();
    expect(await admin.recipeIngredient.count({ where: { recipeId: f.recipeB } })).toBe(1);
  });
});

const PUBLIC: Resolver = async () => [{ address: "93.184.216.34", family: 4 }];
const page = (html: string): Transport => async () => ({ status: 200, body: Buffer.from(html) });
const RECIPE_HTML = `<script type="application/ld+json">{"@type":"Recipe","name":"Tomatensuppe","recipeYield":"2","recipeIngredient":["1 kg Tomaten"],"recipeInstructions":"Kochen."}</script>`;

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    if (e instanceof FetchError) return e.stored;
    if (e instanceof RecipeImportError) return "kein-rezept";
    throw e;
  }
  return "no error";
}

describe("recipe import", () => {
  it("returns an unsaved draft with the source", async () => {
    const before = await admin.recipe.count({ where: { familyId: f.familyA } });
    const d = await importRecipeDraft(f.userA, f.familyA, "https://rezepte.example.test/suppe", { resolve: PUBLIC, transport: page(RECIPE_HTML) }, app);
    expect(d.title).toBe("Tomatensuppe");
    expect(d.sourceUrl).toBe("https://rezepte.example.test/suppe");
    expect(d.ingredients).toEqual([{ quantity: 1, unit: "kg", name: "Tomaten" }]);
    expect(await admin.recipe.count({ where: { familyId: f.familyA } })).toBe(before);
  });

  it("asks for an html page", async () => {
    let accept: string | undefined;
    const t: Transport = async (req) => ((accept = req.accept), { status: 200, body: Buffer.from(RECIPE_HTML) });
    await importRecipeDraft(f.userA, f.familyA, "https://rezepte.example.test/suppe", { resolve: PUBLIC, transport: t }, app);
    expect(accept).toMatch(/^text\/html/);
  });

  it("SSRF: internal addresses, http, webcal, ports, user info and bad redirects are refused before any request", async () => {
    let called = false;
    const spy: Transport = async () => ((called = true), { status: 200, body: Buffer.from(RECIPE_HTML) });
    const o = { resolve: PUBLIC, transport: spy };
    for (const u of ["https://127.0.0.1/", "https://169.254.169.254/latest/meta-data", "https://[::1]/", "https://localhost/", "https://intranet.local/"]) {
      expect(await code(importRecipeDraft(f.userA, f.familyA, u, o, app))).toBe("blockiert");
    }
    for (const u of ["http://rezepte.example.test/", "webcal://rezepte.example.test/", "https://rezepte.example.test:8443/", "https://a:b@rezepte.example.test/", "file:///etc/passwd"]) {
      expect(await code(importRecipeDraft(f.userA, f.familyA, u, o, app))).toBe("protokoll");
    }
    expect(called).toBe(false);
    const privateDns: Resolver = async () => [{ address: "93.184.216.34", family: 4 }, { address: "10.0.0.5", family: 4 }];
    expect(await code(importRecipeDraft(f.userA, f.familyA, "https://rezepte.example.test/", { resolve: privateDns, transport: spy }, app))).toBe("blockiert");
    expect(called).toBe(false);
    const redirect: Transport = async () => ({ status: 302, location: "https://192.168.1.1/admin", body: Buffer.alloc(0) });
    expect(await code(importRecipeDraft(f.userA, f.familyA, "https://rezepte.example.test/", { resolve: PUBLIC, transport: redirect }, app))).toBe("blockiert");
  });

  it("size limit, page without recipe, non-member", async () => {
    expect(await code(importRecipeDraft(f.userA, f.familyA, "https://rezepte.example.test/", { resolve: PUBLIC, transport: page("x".repeat(100)), maxBytes: 50 }, app))).toBe("gross");
    expect(await code(importRecipeDraft(f.userA, f.familyA, "https://rezepte.example.test/", { resolve: PUBLIC, transport: page("<p>nichts</p>") }, app))).toBe("kein-rezept");
    await expect(importRecipeDraft(f.userA, f.familyB, "https://rezepte.example.test/", { resolve: PUBLIC, transport: page(RECIPE_HTML) }, app)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("is rate limited per user", async () => {
    const o = { resolve: PUBLIC, transport: page(RECIPE_HTML) };
    for (let i = 0; i < 10; i++) await importRecipeDraft(f.userA, f.familyA, "https://rezepte.example.test/", o, app);
    await expect(importRecipeDraft(f.userA, f.familyA, "https://rezepte.example.test/", o, app)).rejects.toThrow();
  });
});
