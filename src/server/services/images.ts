import type { PrismaClient } from "@prisma/client";
import { cleanImage } from "../../lib/image-clean";
import { ForbiddenError, NotFoundError } from "../errors";
import { withFamily } from "../tenant";
import { modulesOf } from "./modules";
import { canEditWish } from "./wishes";

export type ImageOwner = { kind: "recipe" | "wish"; id: string };

/** Stores (or replaces) the picture of a recipe or wish. The bytes are checked and cleaned first. */
export async function setImage(userId: string, familyId: string, owner: ImageOwner, bytes: Uint8Array, client?: PrismaClient): Promise<{ id: string }> {
  const { mime, data } = cleanImage(bytes);
  return withFamily(
    userId,
    familyId,
    async (ctx) => {
      const mods = await modulesOf(ctx);
      if (owner.kind === "recipe") {
        if (!mods.meals) throw new NotFoundError("Module off");
        const r = await ctx.tx.recipe.findFirst({ where: { id: owner.id, familyId: ctx.familyId }, select: { id: true } });
        if (!r) throw new NotFoundError("Recipe not found");
      } else {
        if (!mods.wishes) throw new NotFoundError("Module off");
        if (!(await canEditWish(ctx, owner.id))) throw new ForbiddenError("Not your wishlist");
      }
      const where = owner.kind === "recipe" ? { recipeId: owner.id } : { wishId: owner.id };
      await ctx.tx.image.deleteMany({ where: { ...where, familyId: ctx.familyId } });
      return ctx.tx.image.create({
        data: { familyId: ctx.familyId, ...where, mime, size: data.length, data: Buffer.from(data), createdById: ctx.userId },
        select: { id: true },
      });
    },
    client,
  );
}

export async function removeImage(userId: string, familyId: string, owner: ImageOwner, client?: PrismaClient): Promise<void> {
  await withFamily(
    userId,
    familyId,
    async (ctx) => {
      // Like setImage and readImage: a switched-off module is not there (404), not even for deleting.
      const mods = await modulesOf(ctx);
      if (owner.kind === "recipe") {
        if (!mods.meals) throw new NotFoundError("Module off");
        const r = await ctx.tx.recipe.findFirst({ where: { id: owner.id, familyId: ctx.familyId }, select: { id: true } });
        if (!r) throw new NotFoundError("Recipe not found");
        await ctx.tx.image.deleteMany({ where: { recipeId: owner.id, familyId: ctx.familyId } });
      } else {
        if (!mods.wishes) throw new NotFoundError("Module off");
        if (!(await canEditWish(ctx, owner.id))) throw new ForbiddenError("Not your wishlist");
        await ctx.tx.image.deleteMany({ where: { wishId: owner.id, familyId: ctx.familyId } });
      }
    },
    client,
  );
}

/**
 * The picture for the image route. Only within the active family (RLS), only when its module is on and the
 * recipe/wish itself is visible to this user (private wishlists are hidden by RLS). Anything else: null (404).
 */
export async function readImage(userId: string, familyId: string, id: string, client?: PrismaClient): Promise<{ mime: string; data: Uint8Array } | null> {
  try {
    return await withFamily(
      userId,
      familyId,
      async (ctx) => {
        const img = await ctx.tx.image.findFirst({ where: { id, familyId: ctx.familyId }, select: { mime: true, data: true, recipeId: true, wishId: true } });
        if (!img) return null;
        const mods = await modulesOf(ctx);
        if (img.recipeId) {
          if (!mods.meals) return null;
          if (!(await ctx.tx.recipe.findFirst({ where: { id: img.recipeId, familyId: ctx.familyId }, select: { id: true } }))) return null;
        } else if (img.wishId) {
          if (!mods.wishes) return null;
          if (!(await ctx.tx.wish.findFirst({ where: { id: img.wishId, familyId: ctx.familyId }, select: { id: true } }))) return null;
        } else return null;
        return { mime: img.mime, data: img.data };
      },
      client,
    );
  } catch (e) {
    if (e instanceof ForbiddenError) return null;
    throw e;
  }
}
