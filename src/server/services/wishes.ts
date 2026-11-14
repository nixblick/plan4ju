import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { httpsUrl, OCCASIONS, WISH_LIMITS as L, type Occasion } from "../../lib/wishes";
import { atLeast } from "../permissions";
import { ConflictError, ForbiddenError, NotFoundError } from "../errors";
import { type FamilyContext } from "../tenant";
import { withModule } from "./modules";

// Surprise protection (docs/wunschzettel.md): the wishing person is the user linked to the list's profile.
// In surprise mode that person gets no reservation information at all; row level security hides the
// reservation rows from them too, and reserving never writes to the wish row.

const optText = (max: number) => z.string().trim().max(max).nullish().transform((v) => (v ? v : null));
const https = z
  .string()
  .trim()
  .max(L.url)
  .nullish()
  .transform((v, ctx) => {
    if (!v) return null;
    const u = httpsUrl(v);
    if (!u) ctx.addIssue({ code: "custom", message: "Only https links" });
    return u;
  });

export const listInput = z
  .object({
    title: z.string().trim().min(1).max(L.listTitle),
    description: optText(L.text),
    profileId: z.string().max(100).nullish().transform((v) => v || null),
    personName: optText(100),
    visibility: z.enum(["FAMILY", "PRIVATE"]).default("FAMILY"),
    surprise: z.boolean().default(true),
    birthdayId: z.string().max(100).nullish().transform((v) => v || null),
  })
  .refine((v) => Boolean(v.profileId) !== Boolean(v.personName), { message: "Profile or person name", path: ["profileId"] });
export type ListInput = z.input<typeof listInput>;

export const wishInput = z.object({
  title: z.string().trim().min(1).max(L.title),
  description: optText(L.text),
  url: https,
  imageUrl: https,
  priceCents: z.number().int().min(0).max(L.maxCents).nullish().transform((v) => v ?? null),
  priority: z.number().int().min(1).max(3).default(2),
  note: optText(L.note),
  occasion: z.enum(OCCASIONS).default("ANY"),
});
export type WishInput = z.input<typeof wishInput>;

export type ReservationView =
  | { state: "free" }
  | { state: "reserved"; byMe: boolean; byName: string | null; given: boolean }
  | { state: "reserved-anonymous" };

export interface WishView {
  id: string;
  title: string;
  description: string | null;
  url: string | null;
  imageUrl: string | null;
  priceCents: number | null;
  priority: number;
  note: string | null;
  occasion: Occasion;
  received: boolean;
  /** null: not shown to this viewer (wishing person in surprise mode). */
  reservation: ReservationView | null;
}

export interface WishlistView {
  id: string;
  title: string;
  description: string | null;
  ownerName: string;
  profileId: string | null;
  personName: string | null;
  visibility: "FAMILY" | "PRIVATE";
  surprise: boolean;
  birthday: { id: string; name: string; month: number; day: number } | null;
  iAmWisher: boolean;
  canEdit: boolean;
  wishes: WishView[];
}

const listInclude = {
  profile: { select: { displayName: true, userId: true } },
  birthday: { select: { id: true, name: true, month: true, day: true } },
} as const;

type ListRow = { id: string; createdById: string; profileId: string | null; profile: { userId: string | null } | null };

const isWisher = (ctx: FamilyContext, l: ListRow) => Boolean(l.profile?.userId) && l.profile!.userId === ctx.userId;
const canEditList = (ctx: FamilyContext, l: ListRow) =>
  l.createdById === ctx.userId || isWisher(ctx, l) || (l.profileId !== null && !l.profile?.userId && atLeast(ctx.role, "ADMIN"));

async function loadList(ctx: FamilyContext, id: string) {
  const l = await ctx.tx.wishlist.findFirst({ where: { id, familyId: ctx.familyId }, include: listInclude });
  if (!l) throw new NotFoundError("Wishlist not found");
  return l;
}

async function loadEditable(ctx: FamilyContext, id: string) {
  const l = await loadList(ctx, id);
  if (!canEditList(ctx, l)) throw new ForbiddenError("Not your wishlist");
  return l;
}

async function loadWish(ctx: FamilyContext, wishId: string) {
  const w = await ctx.tx.wish.findFirst({ where: { id: wishId, familyId: ctx.familyId }, select: { id: true, listId: true } });
  if (!w) throw new NotFoundError("Wish not found");
  return { wish: w, list: await loadList(ctx, w.listId) };
}

async function assertRefs(ctx: FamilyContext, d: z.output<typeof listInput>) {
  if (d.profileId && !(await ctx.tx.familyProfile.findFirst({ where: { id: d.profileId, familyId: ctx.familyId }, select: { id: true } })))
    throw new NotFoundError("Unknown profile");
  if (d.birthdayId && !(await ctx.tx.birthday.findFirst({ where: { id: d.birthdayId, familyId: ctx.familyId }, select: { id: true } })))
    throw new NotFoundError("Unknown birthday");
}

async function namesOf(ctx: FamilyContext, userIds: string[]): Promise<Map<string, string>> {
  if (!userIds.length) return new Map();
  const rows = await ctx.tx.familyProfile.findMany({ where: { familyId: ctx.familyId, userId: { in: userIds } }, select: { userId: true, displayName: true } });
  return new Map(rows.map((r) => [r.userId!, r.displayName]));
}

async function viewLists(ctx: FamilyContext, where: { id?: string }) {
  const lists = await ctx.tx.wishlist.findMany({
    where: { familyId: ctx.familyId, ...where },
    include: {
      ...listInclude,
      wishes: { orderBy: [{ received: "asc" }, { priority: "asc" }, { createdAt: "asc" }, { id: "asc" }] },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  const wishIds = lists.flatMap((l) => l.wishes.map((w) => w.id));
  const res = wishIds.length
    ? await ctx.tx.wishReservation.findMany({ where: { familyId: ctx.familyId, wishId: { in: wishIds } }, select: { wishId: true, reservedById: true, given: true } })
    : [];
  const byWish = new Map(res.map((r) => [r.wishId, r]));
  // RLS hides every reservation row from the wishing person; outside surprise mode they only learn which wishes are taken.
  const wisherIds = lists.filter((l) => !l.surprise && isWisher(ctx, l)).flatMap((l) => l.wishes.map((w) => w.id));
  const takenForWisher = new Set(
    wisherIds.length
      ? (await ctx.tx.$queryRaw<{ id: string }[]>`SELECT app_wish_reserved_for_wisher(${wisherIds}::text[]) AS id`).map((r) => r.id)
      : [],
  );
  const names = await namesOf(ctx, [...new Set(res.map((r) => r.reservedById))]);
  return lists.map<WishlistView>((l) => {
    const wisher = isWisher(ctx, l);
    return {
      id: l.id,
      title: l.title,
      description: l.description,
      ownerName: l.profile?.displayName ?? l.personName ?? "",
      profileId: l.profileId,
      personName: l.personName,
      visibility: l.visibility,
      surprise: l.surprise,
      birthday: l.birthday,
      iAmWisher: wisher,
      canEdit: canEditList(ctx, l),
      wishes: l.wishes.map((w) => {
        const r = byWish.get(w.id);
        let reservation: ReservationView | null;
        if (wisher) reservation = l.surprise ? null : takenForWisher.has(w.id) ? { state: "reserved-anonymous" } : { state: "free" };
        else reservation = r ? { state: "reserved", byMe: r.reservedById === ctx.userId, byName: names.get(r.reservedById) ?? null, given: r.given } : { state: "free" };
        return {
          id: w.id, title: w.title, description: w.description, url: w.url, imageUrl: w.imageUrl, priceCents: w.priceCents,
          priority: w.priority, note: w.note, occasion: w.occasion, received: w.received, reservation,
        };
      }),
    };
  });
}

/** Every list this user may see (private lists of others are invisible). */
export function listWishlists(userId: string, familyId: string, client?: PrismaClient): Promise<WishlistView[]> {
  return withModule("wishes", userId, familyId, (ctx) => viewLists(ctx, {}), client);
}

export function getWishlist(userId: string, familyId: string, id: string, client?: PrismaClient): Promise<WishlistView> {
  return withModule("wishes", 
    userId,
    familyId,
    async (ctx) => {
      const [l] = await viewLists(ctx, { id });
      if (!l) throw new NotFoundError("Wishlist not found");
      return l;
    },
    client,
  );
}

/** Lists linked to birthdays, for the birthday page. */
export function wishlistsByBirthday(userId: string, familyId: string, client?: PrismaClient): Promise<Map<string, { id: string; title: string }[]>> {
  return withModule("wishes", 
    userId,
    familyId,
    async (ctx) => {
      const rows = await ctx.tx.wishlist.findMany({ where: { familyId: ctx.familyId, birthdayId: { not: null } }, select: { id: true, title: true, birthdayId: true }, orderBy: { createdAt: "asc" } });
      const m = new Map<string, { id: string; title: string }[]>();
      for (const r of rows) m.set(r.birthdayId!, [...(m.get(r.birthdayId!) ?? []), { id: r.id, title: r.title }]);
      return m;
    },
    client,
  );
}

export async function createWishlist(userId: string, familyId: string, raw: ListInput, client?: PrismaClient) {
  const d = listInput.parse(raw);
  return withModule("wishes", 
    userId,
    familyId,
    async (ctx) => {
      await assertRefs(ctx, d);
      if ((await ctx.tx.wishlist.count({ where: { familyId: ctx.familyId } })) >= L.lists) throw new ConflictError("Too many lists");
      return ctx.tx.wishlist.create({
        data: { familyId: ctx.familyId, ...d, createdById: ctx.userId },
        select: { id: true },
      });
    },
    client,
  );
}

export async function updateWishlist(userId: string, familyId: string, id: string, raw: ListInput, client?: PrismaClient) {
  const d = listInput.parse(raw);
  return withModule("wishes", 
    userId,
    familyId,
    async (ctx) => {
      const l = await loadEditable(ctx, id);
      await assertRefs(ctx, d);
      // only the creator may make a list private (it would vanish for everyone else, the creator keeps it)
      if (d.visibility === "PRIVATE" && l.createdById !== ctx.userId) throw new ForbiddenError("Only the creator can hide a list");
      // the wishing person must not lift the surprise protection: no switching it off, no moving the list away
      if (isWisher(ctx, l) && ((l.surprise && !d.surprise) || d.profileId !== l.profileId || d.personName !== l.personName))
        throw new ForbiddenError("Surprise protection");
      await ctx.tx.wishlist.update({ where: { id: l.id }, data: d });
    },
    client,
  );
}

export function deleteWishlist(userId: string, familyId: string, id: string, client?: PrismaClient) {
  return withModule("wishes", 
    userId,
    familyId,
    async (ctx) => {
      const l = await loadEditable(ctx, id);
      await ctx.tx.wishlist.delete({ where: { id: l.id } });
    },
    client,
  );
}

export async function createWish(userId: string, familyId: string, listId: string, raw: WishInput, client?: PrismaClient) {
  const d = wishInput.parse(raw);
  return withModule("wishes", 
    userId,
    familyId,
    async (ctx) => {
      const l = await loadEditable(ctx, listId);
      if ((await ctx.tx.wish.count({ where: { listId: l.id, familyId: ctx.familyId } })) >= L.wishes) throw new ConflictError("Too many wishes");
      return ctx.tx.wish.create({ data: { familyId: ctx.familyId, listId: l.id, ...d, createdById: ctx.userId }, select: { id: true } });
    },
    client,
  );
}

export async function updateWish(userId: string, familyId: string, wishId: string, raw: WishInput, client?: PrismaClient) {
  const d = wishInput.parse(raw);
  return withModule("wishes", 
    userId,
    familyId,
    async (ctx) => {
      const { wish, list } = await loadWish(ctx, wishId);
      if (!canEditList(ctx, list)) throw new ForbiddenError("Not your wishlist");
      await ctx.tx.wish.update({ where: { id: wish.id }, data: d });
    },
    client,
  );
}

export function deleteWish(userId: string, familyId: string, wishId: string, client?: PrismaClient) {
  return withModule("wishes", 
    userId,
    familyId,
    async (ctx) => {
      const { wish, list } = await loadWish(ctx, wishId);
      if (!canEditList(ctx, list)) throw new ForbiddenError("Not your wishlist");
      await ctx.tx.wish.delete({ where: { id: wish.id } });
    },
    client,
  );
}

/** The wishing person (or whoever edits the list) marks a wish as received; visible to everyone. */
export function setWishReceived(userId: string, familyId: string, wishId: string, received: boolean, client?: PrismaClient) {
  return withModule("wishes", 
    userId,
    familyId,
    async (ctx) => {
      const { wish, list } = await loadWish(ctx, wishId);
      if (!canEditList(ctx, list)) throw new ForbiddenError("Not your wishlist");
      await ctx.tx.wish.update({ where: { id: wish.id }, data: { received } });
    },
    client,
  );
}

/**
 * Reserve a wish for oneself. The wishing person is refused with a plain ForbiddenError before any
 * lookup of the reservation, so they cannot probe "already reserved" through a conflict.
 */
export function reserveWish(userId: string, familyId: string, wishId: string, client?: PrismaClient) {
  return withModule("wishes", 
    userId,
    familyId,
    async (ctx) => {
      const { wish, list } = await loadWish(ctx, wishId);
      if (isWisher(ctx, list)) throw new ForbiddenError("Own wish");
      try {
        await ctx.tx.wishReservation.create({ data: { familyId: ctx.familyId, wishId: wish.id, reservedById: ctx.userId } });
      } catch (e) {
        if (e && typeof e === "object" && (e as { code?: unknown }).code === "P2002") throw new ConflictError("Already reserved");
        throw e;
      }
    },
    client,
  );
}

/** Only the member who reserved can release the reservation or mark it as given. */
export function releaseWish(userId: string, familyId: string, wishId: string, client?: PrismaClient) {
  return withModule("wishes", 
    userId,
    familyId,
    async (ctx) => {
      const { wish, list } = await loadWish(ctx, wishId);
      if (isWisher(ctx, list)) throw new ForbiddenError("Own wish");
      const r = await ctx.tx.wishReservation.deleteMany({ where: { wishId: wish.id, familyId: ctx.familyId, reservedById: ctx.userId } });
      if (r.count === 0) throw new NotFoundError("No own reservation");
    },
    client,
  );
}

export function setReservationGiven(userId: string, familyId: string, wishId: string, given: boolean, client?: PrismaClient) {
  return withModule("wishes", 
    userId,
    familyId,
    async (ctx) => {
      const { wish, list } = await loadWish(ctx, wishId);
      if (isWisher(ctx, list)) throw new ForbiddenError("Own wish");
      const r = await ctx.tx.wishReservation.updateMany({ where: { wishId: wish.id, familyId: ctx.familyId, reservedById: ctx.userId }, data: { given } });
      if (r.count === 0) throw new NotFoundError("No own reservation");
    },
    client,
  );
}
