import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { addSource, DEFAULT_SHOPS, mergeAmounts, nameKey, SHOPPING_LIMITS as L } from "../../lib/shopping";
import { ConflictError, NotFoundError } from "../errors";
import { withFamily, type FamilyContext } from "../tenant";

/** Unique index race, shop limit, last shop: conflict, not 500. */
export class ShoppingConflictError extends ConflictError {
  constructor(message = "Shopping conflict") {
    super(message);
    this.name = "ShoppingConflictError";
  }
}

function uniqueToConflict(e: unknown): never {
  if (e && typeof e === "object" && (e as { code?: unknown }).code === "P2002") throw new ShoppingConflictError("Unique constraint");
  throw e;
}

const optText = (max: number) => z.string().trim().max(max).nullish().transform((v) => (v ? v : null));
const quantity = z.number().finite().positive().max(100_000).nullish().transform((v) => v ?? null);
const shopIds = z.array(z.string().max(100)).max(L.shops).default([]).transform((a) => [...new Set(a.filter(Boolean))]);

export const itemInput = z.object({
  name: z.string().trim().min(1).max(L.name),
  quantity,
  unit: optText(L.unit),
  note: optText(L.note),
  shopIds,
});
export type ItemInput = z.input<typeof itemInput>;

export const transferInput = z.object({
  recipeId: z.string().min(1).max(100),
  lines: z
    .array(z.object({ ingredientId: z.string().min(1).max(100), quantity, unit: optText(L.unit), shopIds }))
    .min(1)
    .max(100),
});
export type TransferInput = z.input<typeof transferInput>;

const shopName = z.string().trim().min(1).max(L.shopName);

async function ensureShops(ctx: FamilyContext) {
  const n = await ctx.tx.shop.count({ where: { familyId: ctx.familyId } });
  if (n === 0) {
    await ctx.tx.shop.createMany({ data: DEFAULT_SHOPS.map((name, position) => ({ familyId: ctx.familyId, name, position })), skipDuplicates: true });
  }
  return ctx.tx.shop.findMany({ where: { familyId: ctx.familyId }, orderBy: [{ position: "asc" }, { name: "asc" }], select: { id: true, name: true, position: true } });
}

async function assertShops(ctx: FamilyContext, ids: string[]) {
  if (!ids.length) return;
  const n = await ctx.tx.shop.count({ where: { id: { in: ids }, familyId: ctx.familyId } });
  if (n !== ids.length) throw new NotFoundError("Unknown shop");
}

async function assertRoom(ctx: FamilyContext, more: number) {
  const n = await ctx.tx.shoppingItem.count({ where: { familyId: ctx.familyId } });
  if (n + more > L.items) throw new ShoppingConflictError("Too many items");
}

async function setShops(ctx: FamilyContext, itemId: string, ids: string[], replace: boolean) {
  if (replace) await ctx.tx.shoppingItemShop.deleteMany({ where: { itemId, familyId: ctx.familyId } });
  if (ids.length) await ctx.tx.shoppingItemShop.createMany({ data: ids.map((shopId) => ({ itemId, shopId, familyId: ctx.familyId })), skipDuplicates: true });
}

export interface ShoppingItemView {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  note: string | null;
  done: boolean;
  cleared: boolean;
  fromRecipes: string[];
  shopIds: string[];
}

export interface ShoppingList {
  shops: { id: string; name: string; position: number }[];
  open: ShoppingItemView[];
  done: ShoppingItemView[];
  cleared: ShoppingItemView[];
}

/** The whole list; `shopId` limits it to one shop (unknown id: empty list, never a foreign shop). */
export function getShoppingList(userId: string, familyId: string, opts: { shopId?: string | null } = {}, client?: PrismaClient): Promise<ShoppingList> {
  return withFamily(
    userId,
    familyId,
    async (ctx) => {
      const shops = await ensureShops(ctx);
      const rows = await ctx.tx.shoppingItem.findMany({
        where: { familyId: ctx.familyId, ...(opts.shopId ? { shops: { some: { shopId: opts.shopId } } } : {}) },
        include: { shops: { select: { shopId: true } } },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      });
      const view = rows.map<ShoppingItemView>((r) => ({
        id: r.id, name: r.name, quantity: r.quantity, unit: r.unit, note: r.note, done: r.done, cleared: Boolean(r.clearedAt),
        fromRecipes: r.fromRecipes, shopIds: r.shops.map((s) => s.shopId),
      }));
      return {
        shops,
        open: view.filter((i) => !i.done && !i.cleared),
        done: view.filter((i) => i.done && !i.cleared),
        cleared: view.filter((i) => i.cleared),
      };
    },
    client,
  );
}

export function createItem(userId: string, familyId: string, raw: ItemInput, client?: PrismaClient) {
  const d = itemInput.parse(raw);
  return withFamily(
    userId,
    familyId,
    async (ctx) => {
      await assertShops(ctx, d.shopIds);
      await assertRoom(ctx, 1);
      const item = await ctx.tx.shoppingItem.create({
        data: { familyId: ctx.familyId, name: d.name, quantity: d.quantity, unit: d.unit, note: d.note, fromRecipes: [], createdById: ctx.userId },
        select: { id: true },
      });
      await setShops(ctx, item.id, d.shopIds, false);
      return item;
    },
    client,
  );
}

export function updateItem(userId: string, familyId: string, id: string, raw: ItemInput, client?: PrismaClient) {
  const d = itemInput.parse(raw);
  return withFamily(
    userId,
    familyId,
    async (ctx) => {
      await assertShops(ctx, d.shopIds);
      const res = await ctx.tx.shoppingItem.updateMany({ where: { id, familyId: ctx.familyId }, data: { name: d.name, quantity: d.quantity, unit: d.unit, note: d.note } });
      if (res.count === 0) throw new NotFoundError("Item not found");
      await setShops(ctx, id, d.shopIds, true);
    },
    client,
  );
}

export function deleteItem(userId: string, familyId: string, id: string, client?: PrismaClient) {
  return withFamily(
    userId,
    familyId,
    async (ctx) => {
      const res = await ctx.tx.shoppingItem.deleteMany({ where: { id, familyId: ctx.familyId } });
      if (res.count === 0) throw new NotFoundError("Item not found");
    },
    client,
  );
}

/** Ticks an entry off (done) or puts it back on the list (open, also from the cleared ones). */
export function setItemDone(userId: string, familyId: string, id: string, done: boolean, client?: PrismaClient) {
  return withFamily(
    userId,
    familyId,
    async (ctx) => {
      const res = await ctx.tx.shoppingItem.updateMany({
        where: { id, familyId: ctx.familyId },
        data: done ? { done: true, doneAt: new Date() } : { done: false, doneAt: null, clearedAt: null },
      });
      if (res.count === 0) throw new NotFoundError("Item not found");
    },
    client,
  );
}

/** "Erledigte wegräumen": hides the done entries; they can be restored later. Returns how many. */
export function clearDone(userId: string, familyId: string, client?: PrismaClient) {
  return withFamily(
    userId,
    familyId,
    async (ctx) => (await ctx.tx.shoppingItem.updateMany({ where: { familyId: ctx.familyId, done: true, clearedAt: null }, data: { clearedAt: new Date() } })).count,
    client,
  );
}

/** Deletes the cleared entries for good. */
export function purgeCleared(userId: string, familyId: string, client?: PrismaClient) {
  return withFamily(
    userId,
    familyId,
    async (ctx) => (await ctx.tx.shoppingItem.deleteMany({ where: { familyId: ctx.familyId, clearedAt: { not: null } } })).count,
    client,
  );
}

// ---- Shops ---------------------------------------------------------------------------

export function addShop(userId: string, familyId: string, name: string, client?: PrismaClient) {
  const n = shopName.parse(name);
  return withFamily(
    userId,
    familyId,
    async (ctx) => {
      const shops = await ensureShops(ctx);
      if (shops.length >= L.shops) throw new ShoppingConflictError("Too many shops");
      const max = shops.reduce((m, s) => Math.max(m, s.position), -1);
      return ctx.tx.shop.create({ data: { familyId: ctx.familyId, name: n, position: max + 1 }, select: { id: true } }).catch(uniqueToConflict);
    },
    client,
  );
}

export function renameShop(userId: string, familyId: string, id: string, name: string, client?: PrismaClient) {
  const n = shopName.parse(name);
  return withFamily(
    userId,
    familyId,
    async (ctx) => {
      const res = await ctx.tx.shop.updateMany({ where: { id, familyId: ctx.familyId }, data: { name: n } }).catch(uniqueToConflict);
      if (res.count === 0) throw new NotFoundError("Shop not found");
    },
    client,
  );
}

/** Moves a shop one place up (-1) or down (+1) and renumbers the order. */
export function moveShop(userId: string, familyId: string, id: string, dir: -1 | 1, client?: PrismaClient) {
  return withFamily(
    userId,
    familyId,
    async (ctx) => {
      const shops = await ensureShops(ctx);
      const i = shops.findIndex((s) => s.id === id);
      if (i < 0) throw new NotFoundError("Shop not found");
      const j = i + dir;
      if (j < 0 || j >= shops.length) return;
      const order = [...shops];
      [order[i], order[j]] = [order[j]!, order[i]!];
      for (const [position, s] of order.entries()) await ctx.tx.shop.updateMany({ where: { id: s.id, familyId: ctx.familyId }, data: { position } });
    },
    client,
  );
}

/** Removes a shop; its entries stay on the list without it. The last shop stays. */
export function deleteShop(userId: string, familyId: string, id: string, client?: PrismaClient) {
  return withFamily(
    userId,
    familyId,
    async (ctx) => {
      const shops = await ensureShops(ctx);
      if (!shops.some((s) => s.id === id)) throw new NotFoundError("Shop not found");
      if (shops.length <= 1) throw new ShoppingConflictError("Last shop");
      await ctx.tx.shop.deleteMany({ where: { id, familyId: ctx.familyId } });
    },
    client,
  );
}

// ---- Recipe ingredients --------------------------------------------------------------

/**
 * Puts the chosen ingredients of a recipe on the list. Names always come from the stored recipe,
 * quantity, unit and shops from the preview. An open entry with the same name and a compatible
 * unit is merged (quantities added, shops and "aus Rezept" origin added) instead of duplicated.
 */
export function transferIngredients(userId: string, familyId: string, raw: TransferInput, client?: PrismaClient) {
  const d = transferInput.parse(raw);
  return withFamily(
    userId,
    familyId,
    async (ctx) => {
      const recipe = await ctx.tx.recipe.findFirst({
        where: { id: d.recipeId, familyId: ctx.familyId },
        select: { title: true, ingredients: { select: { id: true, name: true } } },
      });
      if (!recipe) throw new NotFoundError("Unknown recipe");
      const names = new Map(recipe.ingredients.map((i) => [i.id, i.name]));
      if (d.lines.some((l) => !names.has(l.ingredientId))) throw new NotFoundError("Unknown ingredient");
      await assertShops(ctx, [...new Set(d.lines.flatMap((l) => l.shopIds))]);

      const open = await ctx.tx.shoppingItem.findMany({
        where: { familyId: ctx.familyId, done: false, clearedAt: null },
        select: { id: true, name: true, quantity: true, unit: true, fromRecipes: true },
        orderBy: { createdAt: "asc" },
      });
      let created = 0;
      let merged = 0;
      for (const line of d.lines) {
        const name = names.get(line.ingredientId)!;
        const key = nameKey(name);
        let target: (typeof open)[number] | undefined;
        let amount = null;
        for (const o of open) {
          if (nameKey(o.name) !== key) continue;
          amount = mergeAmounts({ quantity: o.quantity, unit: o.unit }, { quantity: line.quantity, unit: line.unit });
          if (amount) {
            target = o;
            break;
          }
        }
        if (target && amount) {
          target.quantity = amount.quantity;
          target.unit = amount.unit;
          target.fromRecipes = addSource(target.fromRecipes, recipe.title);
          await ctx.tx.shoppingItem.updateMany({ where: { id: target.id, familyId: ctx.familyId }, data: { quantity: amount.quantity, unit: amount.unit, fromRecipes: target.fromRecipes } });
          await setShops(ctx, target.id, line.shopIds, false);
          merged++;
        } else {
          await assertRoom(ctx, 1);
          const item = await ctx.tx.shoppingItem.create({
            data: { familyId: ctx.familyId, name, quantity: line.quantity, unit: line.unit, fromRecipes: [recipe.title], createdById: ctx.userId },
            select: { id: true, name: true, quantity: true, unit: true, fromRecipes: true },
          });
          open.push(item);
          await setShops(ctx, item.id, line.shopIds, false);
          created++;
        }
      }
      return { created, merged };
    },
    client,
  );
}
