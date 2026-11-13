import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, app, cleanup, seed, type Fixture } from "./helpers";
import { ForbiddenError, NotFoundError } from "../src/server/errors";
import { getDashboard } from "../src/server/services/dashboard";
import {
  addMealSlot, copyMealWeek, createMeal, deleteMeal, deleteMealSlot, getMealWeek, MealConflictError, moveMealSlot, renameMealSlot, updateMeal,
} from "../src/server/services/meals";
import { createRecipe, deleteRecipe } from "../src/server/services/recipes";

let f: Fixture;
beforeAll(async () => {
  f = await seed();
});
afterAll(async () => {
  await cleanup(f);
  await app.$disconnect();
  await admin.$disconnect();
});

const NOW = new Date("2026-11-18T10:00:00Z"); // Wednesday
const MON = "2026-11-16";

async function slotsA() {
  return (await getMealWeek(f.userA, f.familyA, MON, NOW, app)).slots;
}

describe("meal plan", () => {
  it("creates the default slots once and returns the week Mon-Sun", async () => {
    const w = await getMealWeek(f.userA, f.familyA, "2026-11-19", NOW, app);
    expect(w.days[0]).toBe(MON);
    expect(w.days[6]).toBe("2026-11-22");
    expect(w.today).toBe("2026-11-18");
    expect(w.slots.map((s) => s.name)).toEqual(["Frühstück", "Mittag", "Abend"]);
    await getMealWeek(f.userA, f.familyA, MON, NOW, app);
    expect(await admin.mealSlot.count({ where: { familyId: f.familyA } })).toBe(3);
  });

  it("plans a recipe and a free text with cooks; a taken slot is refused; dashboard shows today", async () => {
    const [, mittag, abend] = await slotsA();
    const { id: recipeId } = await createRecipe(f.userA, f.familyA, { title: "Linsensuppe", ingredients: [], steps: [], tags: [], imageUrl: "https://bilder.example.test/suppe.jpg" }, app);
    const m1 = await createMeal(f.userA, f.familyA, { date: "2026-11-18", slotId: mittag!.id, recipeId, cookIds: [f.profileA] }, app);
    await createMeal(f.userA, f.familyA, { date: "2026-11-18", slotId: abend!.id, text: "Reste" }, app);
    await expect(createMeal(f.userA, f.familyA, { date: "2026-11-18", slotId: mittag!.id, text: "Doppelt" }, app)).rejects.toBeInstanceOf(MealConflictError);
    await expect(createMeal(f.userA, f.familyA, { date: "2026-11-18", slotId: mittag!.id }, app)).rejects.toThrow();

    const w = await getMealWeek(f.userA, f.familyA, MON, NOW, app);
    expect(w.meals.find((m) => m.id === m1.id)).toMatchObject({ recipeTitle: "Linsensuppe", cookIds: [f.profileA], text: null });

    const d = await getDashboard(f.userA, f.familyA, NOW, app);
    expect(d.mealsToday?.map((m) => [m.slotName, m.recipeTitle ?? m.text])).toEqual([["Mittag", "Linsensuppe"], ["Abend", "Reste"]]);
    expect(d.mealsToday?.[0]?.imageUrl).toBe("https://bilder.example.test/suppe.jpg");
    expect(JSON.stringify(await getDashboard(f.userB, f.familyB, NOW, app))).not.toContain("Linsensuppe");
  });

  it("moves a meal to a free slot and refuses a taken one", async () => {
    const [fr, mittag] = await slotsA();
    const m = await createMeal(f.userA, f.familyA, { date: "2026-11-19", slotId: mittag!.id, text: "Pfannkuchen" }, app);
    await updateMeal(f.userA, f.familyA, m.id, { date: "2026-11-20", slotId: fr!.id, text: "Pfannkuchen" }, app);
    expect((await admin.meal.findUniqueOrThrow({ where: { id: m.id } })).date.toISOString().slice(0, 10)).toBe("2026-11-20");
    await expect(updateMeal(f.userA, f.familyA, m.id, { date: "2026-11-18", slotId: mittag!.id, text: "x" }, app)).rejects.toBeInstanceOf(MealConflictError);
  });

  it("foreign recipe, profile, slot or meal give NotFound and write nothing", async () => {
    const [, mittag] = await slotsA();
    const slotB = (await getMealWeek(f.userB, f.familyB, MON, NOW, app)).slots[0]!;
    const before = await admin.meal.count();
    await expect(createMeal(f.userA, f.familyA, { date: "2026-11-21", slotId: mittag!.id, recipeId: f.recipeB }, app)).rejects.toBeInstanceOf(NotFoundError);
    await expect(createMeal(f.userA, f.familyA, { date: "2026-11-21", slotId: mittag!.id, text: "x", cookIds: [f.profileB] }, app)).rejects.toBeInstanceOf(NotFoundError);
    await expect(createMeal(f.userA, f.familyA, { date: "2026-11-21", slotId: slotB.id, text: "x" }, app)).rejects.toBeInstanceOf(NotFoundError);
    const mB = await createMeal(f.userB, f.familyB, { date: "2026-11-21", slotId: slotB.id, text: "Geheimes Essen B" }, app);
    await expect(updateMeal(f.userA, f.familyA, mB.id, { date: "2026-11-21", slotId: mittag!.id, text: "gehackt" }, app)).rejects.toBeInstanceOf(NotFoundError);
    await expect(deleteMeal(f.userA, f.familyA, mB.id, app)).rejects.toBeInstanceOf(NotFoundError);
    await expect(renameMealSlot(f.userA, f.familyA, slotB.id, "gehackt", app)).rejects.toBeInstanceOf(NotFoundError);
    await expect(deleteMealSlot(f.userA, f.familyA, slotB.id, app)).rejects.toBeInstanceOf(NotFoundError);
    expect(await admin.meal.count()).toBe(before + 1);
    expect((await admin.meal.findUniqueOrThrow({ where: { id: mB.id } })).text).toBe("Geheimes Essen B");
    expect(JSON.stringify(await getMealWeek(f.userA, f.familyA, MON, NOW, app))).not.toContain("Geheimes Essen B");
  });

  it("non-member is refused", async () => {
    await expect(getMealWeek(f.userNone, f.familyA, MON, NOW, app)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(createMeal(f.userNone, f.familyA, { date: MON, slotId: "x", text: "x" }, app)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(copyMealWeek(f.userNone, f.familyA, MON, null, app)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("copies a week with cooks and never overwrites planned slots", async () => {
    const [fr, , abend] = await slotsA();
    const nextMon = "2026-11-23";
    await createMeal(f.userA, f.familyA, { date: "2026-11-25", slotId: abend!.id, text: "Schon geplant" }, app);
    const n = await copyMealWeek(f.userA, f.familyA, "2026-11-18", null, app);
    const target = await getMealWeek(f.userA, f.familyA, nextMon, NOW, app);
    const src = await getMealWeek(f.userA, f.familyA, MON, NOW, app);
    expect(n).toBe(src.meals.length - 1);
    expect(target.meals.find((m) => m.date === "2026-11-25" && m.slotId === abend!.id)?.text).toBe("Schon geplant");
    expect(target.meals.find((m) => m.date === "2026-11-27" && m.slotId === fr!.id)?.text).toBe("Pfannkuchen");
    expect(target.meals.find((m) => m.recipeTitle === "Linsensuppe")?.cookIds).toEqual([f.profileA]);
    expect(await copyMealWeek(f.userA, f.familyA, MON, MON, app)).toBe(0);
  });

  it("deleting a planned recipe keeps the meal as free text", async () => {
    const [fr] = await slotsA();
    const { id: recipeId } = await createRecipe(f.userA, f.familyA, { title: "Kürbisrisotto", ingredients: [], steps: [], tags: [] }, app);
    const m = await createMeal(f.userA, f.familyA, { date: "2026-11-22", slotId: fr!.id, recipeId }, app);
    await deleteRecipe(f.userA, f.familyA, recipeId, app);
    expect(await admin.meal.findUniqueOrThrow({ where: { id: m.id } })).toMatchObject({ recipeId: null, text: "Kürbisrisotto" });
  });

  it("slots: add, rename, reorder, delete with its meals; names unique; last slot stays", async () => {
    const { id } = await addMealSlot(f.userA, f.familyA, "Snack", app);
    await expect(addMealSlot(f.userA, f.familyA, "snack", app)).rejects.toBeInstanceOf(MealConflictError);
    await renameMealSlot(f.userA, f.familyA, id, "Vesper", app);
    await moveMealSlot(f.userA, f.familyA, id, -1, app);
    expect((await slotsA()).map((s) => s.name)).toEqual(["Frühstück", "Mittag", "Vesper", "Abend"]);
    await createMeal(f.userA, f.familyA, { date: MON, slotId: id, text: "Apfel" }, app);
    await deleteMealSlot(f.userA, f.familyA, id, app);
    expect(await admin.meal.count({ where: { slotId: id } })).toBe(0);
    for (const s of (await slotsA()).slice(1)) await deleteMealSlot(f.userA, f.familyA, s.id, app);
    const [last] = await slotsA();
    await expect(deleteMealSlot(f.userA, f.familyA, last!.id, app)).rejects.toBeInstanceOf(MealConflictError);
  });
});

describe("meal plan RLS", () => {
  function raw<T>(familyId: string, userId: string, fn: (tx: Parameters<Parameters<typeof app.$transaction>[0]>[0]) => Promise<T>) {
    return app.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.user_id', ${userId}, true)`;
      await tx.$executeRaw`SELECT set_config('app.family_id', ${familyId}, true)`;
      return fn(tx);
    });
  }

  it("family A sees no slot, meal or cook of B and cannot write into B", async () => {
    const slotB = (await getMealWeek(f.userB, f.familyB, MON, NOW, app)).slots[1]!;
    const mB = await createMeal(f.userB, f.familyB, { date: "2026-11-17", slotId: slotB.id, text: "B-Essen", cookIds: [f.profileB] }, app);
    await raw(f.familyA, f.userA, async (tx) => {
      expect(await tx.mealSlot.findMany({ where: { familyId: f.familyB } })).toHaveLength(0);
      expect(await tx.meal.findUnique({ where: { id: mB.id } })).toBeNull();
      expect(await tx.mealCook.findMany({ where: { mealId: mB.id } })).toHaveLength(0);
      expect((await tx.meal.updateMany({ where: { id: mB.id }, data: { text: "gehackt" } })).count).toBe(0);
      expect((await tx.mealCook.deleteMany({ where: { mealId: mB.id } })).count).toBe(0);
    });
    await expect(raw(f.familyA, f.userA, (tx) => tx.meal.create({ data: { familyId: f.familyB, date: new Date(MON), slotId: slotB.id, text: "x", createdById: f.userA } }))).rejects.toThrow();
    // own familyId but foreign slot / recipe / profile: composite keys refuse it
    const slotA = (await slotsA())[0]!;
    await expect(raw(f.familyA, f.userA, (tx) => tx.meal.create({ data: { familyId: f.familyA, date: new Date("2026-12-01"), slotId: slotB.id, text: "x", createdById: f.userA } }))).rejects.toThrow();
    await expect(raw(f.familyA, f.userA, (tx) => tx.meal.create({ data: { familyId: f.familyA, date: new Date("2026-12-01"), slotId: slotA.id, recipeId: f.recipeB, createdById: f.userA } }))).rejects.toThrow();
    const mA = await createMeal(f.userA, f.familyA, { date: "2026-12-02", slotId: slotA.id, text: "A" }, app);
    await expect(raw(f.familyA, f.userA, (tx) => tx.mealCook.create({ data: { familyId: f.familyA, mealId: mA.id, profileId: f.profileB } }))).rejects.toThrow();
    await expect(raw(f.familyA, f.userA, (tx) => tx.mealCook.create({ data: { familyId: f.familyA, mealId: mB.id, profileId: f.profileA } }))).rejects.toThrow();
    expect(await admin.mealCook.count({ where: { mealId: mB.id } })).toBe(1);
  });
});
