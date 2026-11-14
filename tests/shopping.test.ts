import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, app, cleanup, seed, type Fixture } from "./helpers";
import { ForbiddenError, NotFoundError } from "../src/server/errors";
import { addSource, mergeAmounts, nameKey, unitKey } from "../src/lib/shopping";
import { createRecipe, deleteRecipe, getRecipe } from "../src/server/services/recipes";
import {
  addShop, clearDone, createItem, deleteItem, deleteShop, getShoppingList, moveShop, purgeCleared, renameShop, setItemDone,
  ShoppingConflictError, transferIngredients, updateItem,
} from "../src/server/services/shopping";

let f: Fixture;
let shopB = "";
let itemB = "";
beforeAll(async () => {
  f = await seed();
  const s = await admin.shop.create({ data: { familyId: f.familyB, name: "Geheimer Laden B", position: 0 } });
  const i = await admin.shoppingItem.create({ data: { familyId: f.familyB, name: "Geheimer Einkauf B", fromRecipes: [], createdById: f.userB } });
  shopB = s.id;
  itemB = i.id;
});
afterAll(async () => {
  await cleanup(f);
  await app.$disconnect();
  await admin.$disconnect();
});

describe("merge helpers", () => {
  it("matches names and units loosely", () => {
    expect(nameKey("  Rote   Linsen ")).toBe(nameKey("rote linsen"));
    expect(unitKey("Gramm")).toBe("g");
    expect(unitKey("Stück")).toBe(unitKey("Stk."));
    expect(unitKey(null)).toBe("");
  });

  it("adds compatible amounts and refuses the others", () => {
    expect(mergeAmounts({ quantity: 200, unit: "g" }, { quantity: 300, unit: "Gramm" })).toEqual({ quantity: 500, unit: "g" });
    expect(mergeAmounts({ quantity: 1, unit: "kg" }, { quantity: 250, unit: "g" })).toEqual({ quantity: 1.25, unit: "kg" });
    // Sums above the save limit are not merged (new line instead of an unsavable entry).
    expect(mergeAmounts({ quantity: 60_000, unit: "g" }, { quantity: 50_000, unit: "g" })).toBeNull();
    expect(mergeAmounts({ quantity: 90_000, unit: "ml" }, { quantity: 11, unit: "l" })).toBeNull();
    expect(mergeAmounts({ quantity: 50_000, unit: "g" }, { quantity: 50_000, unit: "g" })).toEqual({ quantity: 100_000, unit: "g" });
    expect(mergeAmounts({ quantity: 500, unit: "ml" }, { quantity: 1, unit: "l" })).toEqual({ quantity: 1500, unit: "ml" });
    expect(mergeAmounts({ quantity: 2, unit: null }, { quantity: 3, unit: null })).toEqual({ quantity: 5, unit: null });
    expect(mergeAmounts({ quantity: null, unit: null }, { quantity: 1, unit: "TL" })).toEqual({ quantity: 1, unit: "TL" });
    expect(mergeAmounts({ quantity: 1, unit: "Bund" }, { quantity: null, unit: null })).toEqual({ quantity: 1, unit: "Bund" });
    expect(mergeAmounts({ quantity: 1, unit: "Bund" }, { quantity: 100, unit: "g" })).toBeNull();
    expect(mergeAmounts({ quantity: 1, unit: "l" }, { quantity: 100, unit: "g" })).toBeNull();
  });

  it("adds a source only once", () => {
    expect(addSource(["Suppe"], "Suppe")).toEqual(["Suppe"]);
    expect(addSource(["Suppe"], "Salat")).toEqual(["Suppe", "Salat"]);
  });
});

describe("shopping list", () => {
  it("creates the default shops once", async () => {
    const l = await getShoppingList(f.userA, f.familyA, {}, app);
    expect(l.shops.map((s) => s.name)).toEqual(["Supermarkt", "Drogerie", "Baumarkt", "IKEA"]);
    await getShoppingList(f.userA, f.familyA, {}, app);
    expect(await admin.shop.count({ where: { familyId: f.familyA } })).toBe(4);
  });

  it("adds, edits, filters per shop, ticks off, clears and restores entries", async () => {
    const { shops } = await getShoppingList(f.userA, f.familyA, {}, app);
    const [markt, drogerie] = shops;
    const milk = await createItem(f.userA, f.familyA, { name: "Milch", quantity: 2, unit: "l", note: "laktosefrei", shopIds: [markt!.id] }, app);
    const soap = await createItem(f.userBoth, f.familyA, { name: "Seife", shopIds: [drogerie!.id, markt!.id] }, app);
    let l = await getShoppingList(f.userA, f.familyA, {}, app);
    expect(l.open.map((i) => i.name)).toEqual(["Milch", "Seife"]);
    expect(l.open[0]).toMatchObject({ quantity: 2, unit: "l", note: "laktosefrei" });
    expect((await getShoppingList(f.userA, f.familyA, { shopId: drogerie!.id }, app)).open.map((i) => i.name)).toEqual(["Seife"]);

    await updateItem(f.userA, f.familyA, milk.id, { name: "Hafermilch", quantity: 1, unit: "l", shopIds: [drogerie!.id] }, app);
    l = await getShoppingList(f.userA, f.familyA, { shopId: drogerie!.id }, app);
    expect(l.open.map((i) => i.name).sort()).toEqual(["Hafermilch", "Seife"]);

    await setItemDone(f.userA, f.familyA, soap.id, true, app);
    l = await getShoppingList(f.userA, f.familyA, {}, app);
    expect(l.done.map((i) => i.name)).toEqual(["Seife"]);
    expect(await clearDone(f.userA, f.familyA, app)).toBe(1);
    l = await getShoppingList(f.userA, f.familyA, {}, app);
    expect(l.done).toHaveLength(0);
    expect(l.cleared.map((i) => i.name)).toEqual(["Seife"]);
    await setItemDone(f.userA, f.familyA, soap.id, false, app);
    l = await getShoppingList(f.userA, f.familyA, {}, app);
    expect(l.open.map((i) => i.name)).toContain("Seife");
    expect(l.cleared).toHaveLength(0);

    await setItemDone(f.userA, f.familyA, soap.id, true, app);
    await clearDone(f.userA, f.familyA, app);
    expect(await purgeCleared(f.userA, f.familyA, app)).toBe(1);
    await deleteItem(f.userA, f.familyA, milk.id, app);
    expect((await getShoppingList(f.userA, f.familyA, {}, app)).open).toHaveLength(0);
  });

  it("validates input", async () => {
    expect(() => createItem(f.userA, f.familyA, { name: "  " }, app)).toThrow();
    expect(() => createItem(f.userA, f.familyA, { name: "x", quantity: -1 }, app)).toThrow();
  });

  it("manages shops: add, rename, order, delete (entries stay), last one stays", async () => {
    const s = await addShop(f.userA, f.familyA, "Wochenmarkt", app);
    await expect(addShop(f.userA, f.familyA, "Wochenmarkt", app)).rejects.toBeInstanceOf(ShoppingConflictError);
    await renameShop(f.userA, f.familyA, s.id, "Markt am Platz", app);
    await moveShop(f.userA, f.familyA, s.id, -1, app);
    let { shops } = await getShoppingList(f.userA, f.familyA, {}, app);
    expect(shops.map((x) => x.name)).toEqual(["Supermarkt", "Drogerie", "Baumarkt", "Markt am Platz", "IKEA"]);
    const it = await createItem(f.userA, f.familyA, { name: "Äpfel", shopIds: [s.id] }, app);
    await deleteShop(f.userA, f.familyA, s.id, app);
    const l = await getShoppingList(f.userA, f.familyA, {}, app);
    expect(l.open.find((i) => i.id === it.id)?.shopIds).toEqual([]);
    await deleteItem(f.userA, f.familyA, it.id, app);
    shops = l.shops;
    for (const x of shops.slice(1)) await deleteShop(f.userA, f.familyA, x.id, app);
    await expect(deleteShop(f.userA, f.familyA, shops[0]!.id, app)).rejects.toBeInstanceOf(ShoppingConflictError);
    await addShop(f.userA, f.familyA, "Drogerie", app);
  });
});

describe("recipe ingredients to the list", () => {
  it("transfers selected ingredients, merges equal ones and keeps the recipe origin", async () => {
    const { shops } = await getShoppingList(f.userA, f.familyA, {}, app);
    const markt = shops[0]!.id;
    const soup = await createRecipe(f.userA, f.familyA, {
      title: "Linsensuppe", ingredients: [{ quantity: 200, unit: "g", name: "Linsen" }, { quantity: 1, unit: "Bund", name: "Petersilie" }, { quantity: null, unit: null, name: "Salz" }],
      steps: [], tags: [],
    }, app);
    const dal = await createRecipe(f.userA, f.familyA, { title: "Dal", ingredients: [{ quantity: 0.3, unit: "kg", name: "linsen" }], steps: [], tags: [] }, app);
    const s = await getRecipe(f.userA, f.familyA, soup.id, app);
    const d = await getRecipe(f.userA, f.familyA, dal.id, app);
    const [linsen, , salz] = s.ingredients;

    // only two of three, with an edited quantity and a shop
    const r1 = await transferIngredients(f.userA, f.familyA, {
      recipeId: soup.id,
      lines: [{ ingredientId: linsen!.id, quantity: 400, unit: "g", shopIds: [markt] }, { ingredientId: salz!.id, quantity: null, unit: null }],
    }, app);
    expect(r1).toEqual({ created: 2, merged: 0 });
    const r2 = await transferIngredients(f.userBoth, f.familyA, { recipeId: dal.id, lines: [{ ingredientId: d.ingredients[0]!.id, quantity: 0.3, unit: "kg" }] }, app);
    expect(r2).toEqual({ created: 0, merged: 1 });

    const l = await getShoppingList(f.userA, f.familyA, {}, app);
    const lin = l.open.find((i) => nameKey(i.name) === "linsen")!;
    expect(lin).toMatchObject({ name: "Linsen", quantity: 700, unit: "g", fromRecipes: ["Linsensuppe", "Dal"], shopIds: [markt] });
    expect(l.open.filter((i) => nameKey(i.name) === "linsen")).toHaveLength(1);
    expect(l.open.some((i) => i.name === "Petersilie")).toBe(false);

    // a done entry is not merged into
    await setItemDone(f.userA, f.familyA, lin.id, true, app);
    expect(await transferIngredients(f.userA, f.familyA, { recipeId: dal.id, lines: [{ ingredientId: d.ingredients[0]!.id, quantity: 0.3, unit: "kg" }] }, app)).toEqual({ created: 1, merged: 0 });

    // deleting the recipe keeps the origin readable and does not fail
    await deleteRecipe(f.userA, f.familyA, soup.id, app);
    const after = await getShoppingList(f.userA, f.familyA, {}, app);
    expect(after.open.find((i) => i.name === "Salz")?.fromRecipes).toEqual(["Linsensuppe"]);
  });

  it("refuses foreign recipes, ingredients and shops", async () => {
    const own = await createRecipe(f.userA, f.familyA, { title: "Brot", ingredients: [{ quantity: 1, unit: "kg", name: "Mehl" }], steps: [], tags: [] }, app);
    const ownIng = (await getRecipe(f.userA, f.familyA, own.id, app)).ingredients[0]!.id;
    const foreignIng = (await admin.recipeIngredient.findFirstOrThrow({ where: { recipeId: f.recipeB } })).id;
    await expect(transferIngredients(f.userA, f.familyA, { recipeId: f.recipeB, lines: [{ ingredientId: foreignIng }] }, app)).rejects.toBeInstanceOf(NotFoundError);
    await expect(transferIngredients(f.userA, f.familyA, { recipeId: own.id, lines: [{ ingredientId: foreignIng }] }, app)).rejects.toBeInstanceOf(NotFoundError);
    await expect(transferIngredients(f.userA, f.familyA, { recipeId: own.id, lines: [{ ingredientId: ownIng, shopIds: [shopB] }] }, app)).rejects.toBeInstanceOf(NotFoundError);
    await expect(transferIngredients(f.userNone, f.familyA, { recipeId: own.id, lines: [{ ingredientId: ownIng }] }, app)).rejects.toBeInstanceOf(ForbiddenError);
    expect(await admin.shoppingItem.count({ where: { familyId: f.familyA, name: "Mehl" } })).toBe(0);
  });
});

describe("isolation", () => {
  it("foreign items and shops cannot be read, changed or used", async () => {
    const l = await getShoppingList(f.userA, f.familyA, {}, app);
    expect([...l.open, ...l.done, ...l.cleared].some((i) => i.id === itemB)).toBe(false);
    expect(l.shops.some((s) => s.id === shopB)).toBe(false);
    expect((await getShoppingList(f.userA, f.familyA, { shopId: shopB }, app)).open).toHaveLength(0);
    await expect(updateItem(f.userA, f.familyA, itemB, { name: "gehackt" }, app)).rejects.toBeInstanceOf(NotFoundError);
    await expect(setItemDone(f.userA, f.familyA, itemB, true, app)).rejects.toBeInstanceOf(NotFoundError);
    await expect(deleteItem(f.userA, f.familyA, itemB, app)).rejects.toBeInstanceOf(NotFoundError);
    await expect(renameShop(f.userA, f.familyA, shopB, "gehackt", app)).rejects.toBeInstanceOf(NotFoundError);
    await expect(moveShop(f.userA, f.familyA, shopB, 1, app)).rejects.toBeInstanceOf(NotFoundError);
    await expect(deleteShop(f.userA, f.familyA, shopB, app)).rejects.toBeInstanceOf(NotFoundError);
    await expect(createItem(f.userA, f.familyA, { name: "x", shopIds: [shopB] }, app)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getShoppingList(f.userNone, f.familyA, {}, app)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(createItem(f.userA, f.familyB, { name: "x" }, app)).rejects.toBeInstanceOf(ForbiddenError);
    expect((await admin.shoppingItem.findUniqueOrThrow({ where: { id: itemB } })).name).toBe("Geheimer Einkauf B");
    expect(await admin.shop.count({ where: { id: shopB } })).toBe(1);
  });

  it("RLS hides foreign rows even without a familyId filter and rejects a cross-family link", async () => {
    await app.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.user_id', ${f.userA}, true)`;
      await tx.$executeRaw`SELECT set_config('app.family_id', ${f.familyA}, true)`;
      expect(await tx.shoppingItem.findUnique({ where: { id: itemB } })).toBeNull();
      expect(await tx.shop.findUnique({ where: { id: shopB } })).toBeNull();
      expect((await tx.shoppingItem.updateMany({ where: { id: itemB }, data: { name: "gehackt" } })).count).toBe(0);
      expect((await tx.shop.deleteMany({ where: { id: shopB } })).count).toBe(0);
    });
    const own = await admin.shoppingItem.create({ data: { familyId: f.familyA, name: "Eigener", fromRecipes: [], createdById: f.userA } });
    await expect(
      app.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.user_id', ${f.userA}, true)`;
        await tx.$executeRaw`SELECT set_config('app.family_id', ${f.familyA}, true)`;
        await tx.shoppingItemShop.create({ data: { itemId: own.id, shopId: shopB, familyId: f.familyA } });
      }),
    ).rejects.toThrow();
    await expect(
      app.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.user_id', ${f.userA}, true)`;
        await tx.$executeRaw`SELECT set_config('app.family_id', ${f.familyA}, true)`;
        await tx.shoppingItem.create({ data: { familyId: f.familyB, name: "eingeschmuggelt", fromRecipes: [], createdById: f.userA } });
      }),
    ).rejects.toThrow();
  });
});
