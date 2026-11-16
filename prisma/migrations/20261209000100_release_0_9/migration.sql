-- Release 0.9 (customer feedback): start page order, rating symbol for mindfulness, share links for wish lists.

-- Start page order per user (keys in display order). Empty = default order; unknown keys are ignored when read.
ALTER TABLE "dashboard_pref" ADD COLUMN "order" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "dashboard_pref" ADD CONSTRAINT "dashboard_pref_order_check" CHECK (cardinality("order") <= 30);

-- Rating symbol in the mindfulness module: emoji (default) or colour coded circles. Own row only (existing RLS).
ALTER TABLE "mindfulness_pref" ADD COLUMN "symbol" TEXT NOT NULL DEFAULT 'EMOJI';
ALTER TABLE "mindfulness_pref" ADD CONSTRAINT "mindfulness_pref_symbol_check" CHECK ("symbol" IN ('EMOJI', 'CIRCLE'));

-- Read-only share link of a wish list for people without an account (docs/wunschzettel.md). One link per list;
-- only the SHA-256 hash of the random token is stored. Creating a new link replaces the row, revoking deletes it.
CREATE TABLE "wishlist_share" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "listId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "wishlist_share_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "wishlist_share_hash_check" CHECK ("tokenHash" ~ '^[0-9a-f]{64}$')
);
CREATE UNIQUE INDEX "wishlist_share_listId_key" ON "wishlist_share"("listId");
CREATE UNIQUE INDEX "wishlist_share_tokenHash_key" ON "wishlist_share"("tokenHash");
CREATE INDEX "wishlist_share_familyId_idx" ON "wishlist_share"("familyId");
CREATE UNIQUE INDEX "wishlist_share_listId_familyId_key" ON "wishlist_share"("listId", "familyId");
ALTER TABLE "wishlist_share" ADD CONSTRAINT "wishlist_share_familyId_fkey"
  FOREIGN KEY ("familyId") REFERENCES "family"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "wishlist_share" ADD CONSTRAINT "wishlist_share_listId_familyId_fkey"
  FOREIGN KEY ("listId", "familyId") REFERENCES "wishlist"("id", "familyId") ON DELETE CASCADE ON UPDATE CASCADE;

GRANT SELECT, INSERT, UPDATE, DELETE ON "wishlist_share" TO plan4ju_app;
ALTER TABLE "wishlist_share" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "wishlist_share" FORCE ROW LEVEL SECURITY;
-- Same family and the list itself visible (a private list's link exists for its creator only).
CREATE POLICY family_scope ON "wishlist_share"
  USING ("familyId" = app_family_id() AND EXISTS (SELECT 1 FROM "wishlist" l WHERE l."id" = "wishlist_share"."listId"))
  WITH CHECK ("familyId" = app_family_id() AND "createdById" = app_user_id()
    AND EXISTS (SELECT 1 FROM "wishlist" l WHERE l."id" = "wishlist_share"."listId"));

-- Contextless read for the public page. Returns a whitelist only: the owner's first name and the open wishes
-- (title, description, link, price, priority, occasion). Never reservations, givers, notes, list title or
-- authors. Nothing when the wishes module is off or the link's creator is no longer a member.
CREATE FUNCTION app_wishlist_share_lookup(p_hash text)
  RETURNS jsonb
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT jsonb_build_object(
    'ownerName', split_part(btrim(COALESCE(p."displayName", l."personName", '')), ' ', 1),
    'wishes', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
          'title', w."title", 'description', w."description", 'url', w."url", 'priceCents', w."priceCents",
          'priority', w."priority", 'occasion', w."occasion")
        ORDER BY w."priority", w."createdAt", w."id")
      FROM "wish" w WHERE w."listId" = l."id" AND w."familyId" = l."familyId" AND NOT w."received"), '[]'::jsonb))
  FROM "wishlist_share" s
  JOIN "wishlist" l ON l."id" = s."listId" AND l."familyId" = s."familyId"
  JOIN "family" f ON f."id" = l."familyId"
  LEFT JOIN "family_profile" p ON p."id" = l."profileId" AND p."familyId" = l."familyId"
  WHERE s."tokenHash" = p_hash
    AND f."moduleWishes"
    AND EXISTS (SELECT 1 FROM "family_membership" m WHERE m."familyId" = s."familyId" AND m."userId" = s."createdById");
$$;
REVOKE ALL ON FUNCTION app_wishlist_share_lookup(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_wishlist_share_lookup(text) TO plan4ju_app;
