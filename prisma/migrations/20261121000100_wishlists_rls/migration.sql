-- Row level security for the wish list tables. Besides the family scope:
--   wishlist          PRIVATE lists are visible to their creator only.
--   wish              visible exactly when its list is visible.
--   wish_reservation  invisible (and not insertable) for the wishing person, i.e. the user linked to the
--                     list's profile, while the list is in surprise mode. The profile link is joined live,
--                     so a child profile that later gets a login is protected automatically.
-- See docs/wunschzettel.md.

GRANT SELECT, INSERT, UPDATE, DELETE ON "wishlist", "wish", "wish_reservation" TO plan4ju_app;

ALTER TABLE "wishlist" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "wishlist" FORCE ROW LEVEL SECURITY;
CREATE POLICY family_scope ON "wishlist"
  USING ("familyId" = app_family_id() AND ("visibility" = 'FAMILY' OR "createdById" = app_user_id()))
  WITH CHECK ("familyId" = app_family_id() AND ("visibility" = 'FAMILY' OR "createdById" = app_user_id()));

ALTER TABLE "wish" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "wish" FORCE ROW LEVEL SECURITY;
CREATE POLICY family_scope ON "wish"
  USING ("familyId" = app_family_id() AND EXISTS (SELECT 1 FROM "wishlist" l WHERE l."id" = "wish"."listId"))
  WITH CHECK ("familyId" = app_family_id() AND EXISTS (SELECT 1 FROM "wishlist" l WHERE l."id" = "wish"."listId"));

ALTER TABLE "wish_reservation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "wish_reservation" FORCE ROW LEVEL SECURITY;
CREATE POLICY family_scope ON "wish_reservation"
  USING (
    "familyId" = app_family_id()
    AND EXISTS (
      SELECT 1 FROM "wish" w JOIN "wishlist" l ON l."id" = w."listId"
      WHERE w."id" = "wish_reservation"."wishId"
        AND NOT (l."surprise" AND EXISTS (
          SELECT 1 FROM "family_profile" p WHERE p."id" = l."profileId" AND p."userId" = app_user_id()))
    )
  )
  WITH CHECK (
    "familyId" = app_family_id()
    AND "reservedById" = app_user_id()
    AND EXISTS (
      SELECT 1 FROM "wish" w JOIN "wishlist" l ON l."id" = w."listId"
      WHERE w."id" = "wish_reservation"."wishId"
        AND NOT EXISTS (SELECT 1 FROM "family_profile" p WHERE p."id" = l."profileId" AND p."userId" = app_user_id())
    )
  );
