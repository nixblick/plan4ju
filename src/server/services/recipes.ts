import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { extractRecipe, type RecipeDraft } from "../../lib/recipe-extract";
import { RECIPE_LIMITS as L, safeHttpsUrl } from "../../lib/recipes";
import { NotFoundError } from "../errors";
import { rateLimit } from "../ratelimit";
import { fetchPublicText, parsePublicUrl, type FetchOptions } from "../safe-fetch";
import { withFamily, type Tx } from "../tenant";

const optText = (max: number) =>
  z.string().trim().max(max).nullish().transform((v) => (v ? v : null));
const httpsLink = z
  .string()
  .trim()
  .max(L.url)
  .nullish()
  .transform((v, ctx) => {
    if (!v) return null;
    const u = safeHttpsUrl(v);
    if (!u) ctx.addIssue({ code: "custom", message: "Only https links" });
    return u;
  });

export const ingredientInput = z.object({
  quantity: z.number().finite().positive().max(100_000).nullish().transform((v) => v ?? null),
  unit: optText(L.unit),
  name: z.string().trim().min(1).max(L.ingredientName),
});

export const recipeInput = z.object({
  title: z.string().trim().min(1).max(L.title),
  description: optText(L.description),
  servings: z.number().int().min(1).max(1000).nullish().transform((v) => v ?? null),
  prepMinutes: z.number().int().min(1).max(100_000).nullish().transform((v) => v ?? null),
  ingredients: z.array(ingredientInput).max(L.ingredients),
  steps: z.array(z.string().trim().max(L.step)).max(L.steps).transform((a) => a.filter(Boolean)),
  tags: z
    .array(z.string().trim().max(L.tag))
    .max(L.tags)
    .transform((a) => [...new Set(a.filter(Boolean))]),
  allergens: optText(L.allergens),
  imageUrl: httpsLink,
  sourceUrl: httpsLink,
});
export type RecipeInput = z.input<typeof recipeInput>;

export class RecipeImportError extends Error {
  constructor() {
    super("No schema.org/Recipe found");
    this.name = "RecipeImportError";
  }
}

const withIngredients = { ingredients: { orderBy: { position: "asc" as const } } };

export function listRecipes(userId: string, familyId: string, client?: PrismaClient) {
  return withFamily(
    userId,
    familyId,
    (ctx) =>
      ctx.tx.recipe.findMany({
        where: { familyId: ctx.familyId },
        orderBy: { title: "asc" },
        select: { id: true, title: true, servings: true, prepMinutes: true, tags: true, updatedAt: true },
      }),
    client,
  );
}

export function getRecipe(userId: string, familyId: string, id: string, client?: PrismaClient) {
  return withFamily(
    userId,
    familyId,
    async (ctx) => {
      const r = await ctx.tx.recipe.findFirst({ where: { id, familyId: ctx.familyId }, include: withIngredients });
      if (!r) throw new NotFoundError("Recipe not found");
      return r;
    },
    client,
  );
}

function ingredientRows(tx: Tx, familyId: string, recipeId: string, list: z.output<typeof recipeInput>["ingredients"]) {
  if (list.length === 0) return Promise.resolve();
  return tx.recipeIngredient
    .createMany({ data: list.map((i, position) => ({ familyId, recipeId, position, quantity: i.quantity, unit: i.unit, name: i.name })) })
    .then(() => undefined);
}

export async function createRecipe(userId: string, familyId: string, raw: RecipeInput, client?: PrismaClient) {
  const d = recipeInput.parse(raw);
  return withFamily(
    userId,
    familyId,
    async (ctx) => {
      const { ingredients, ...rest } = d;
      const r = await ctx.tx.recipe.create({ data: { ...rest, familyId: ctx.familyId, createdById: ctx.userId }, select: { id: true } });
      await ingredientRows(ctx.tx, ctx.familyId, r.id, ingredients);
      return r;
    },
    client,
  );
}

export async function updateRecipe(userId: string, familyId: string, id: string, raw: RecipeInput, client?: PrismaClient) {
  const d = recipeInput.parse(raw);
  return withFamily(
    userId,
    familyId,
    async (ctx) => {
      const { ingredients, ...rest } = d;
      const res = await ctx.tx.recipe.updateMany({ where: { id, familyId: ctx.familyId }, data: rest });
      if (res.count === 0) throw new NotFoundError("Recipe not found");
      await ctx.tx.recipeIngredient.deleteMany({ where: { recipeId: id, familyId: ctx.familyId } });
      await ingredientRows(ctx.tx, ctx.familyId, id, ingredients);
    },
    client,
  );
}

export function deleteRecipe(userId: string, familyId: string, id: string, client?: PrismaClient) {
  return withFamily(
    userId,
    familyId,
    async (ctx) => {
      const res = await ctx.tx.recipe.deleteMany({ where: { id, familyId: ctx.familyId } });
      if (res.count === 0) throw new NotFoundError("Recipe not found");
    },
    client,
  );
}

export const IMPORT_LIMIT = { max: 10, windowMs: 10 * 60_000 } as const;

/**
 * Fetches a recipe page (SSRF-checked, https only, 2 MB, 10 s) and returns an unsaved draft.
 * Nothing is stored here: the person corrects the draft and saves it with createRecipe.
 * The membership is checked first, so only family members can make the server fetch.
 */
export async function importRecipeDraft(
  userId: string,
  familyId: string,
  url: string,
  opts: FetchOptions = {},
  client?: PrismaClient,
): Promise<RecipeDraft> {
  await withFamily(userId, familyId, async () => undefined, client);
  parsePublicUrl(url); // an obviously refused address does not use up the limit
  rateLimit(`recipe-import:user:${userId}`, IMPORT_LIMIT.max, IMPORT_LIMIT.windowMs);
  const html = await fetchPublicText(url, {
    maxBytes: 2 * 1024 * 1024,
    ...opts,
    accept: "text/html, application/xhtml+xml;q=0.9, */*;q=0.1",
    userAgent: "Plan4JU-recipe-import",
  });
  const draft = extractRecipe(html, url);
  if (!draft) throw new RecipeImportError();
  return draft;
}
