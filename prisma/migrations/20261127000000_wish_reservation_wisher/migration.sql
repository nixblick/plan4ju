-- The wishing person (the user linked to the list's profile) no longer sees reservation rows at all,
-- also outside surprise mode: the rows carry "reservedById", which must stay with the givers.
-- Outside surprise mode the wishing person only learns WHETHER a wish is taken, through
-- app_wish_reserved_for_wisher(), which returns wish ids and nothing else. See docs/wunschzettel.md.

DROP POLICY family_scope ON "wish_reservation";
CREATE POLICY family_scope ON "wish_reservation"
  USING (
    "familyId" = app_family_id()
    AND EXISTS (
      SELECT 1 FROM "wish" w JOIN "wishlist" l ON l."id" = w."listId"
      WHERE w."id" = "wish_reservation"."wishId"
        AND NOT EXISTS (SELECT 1 FROM "family_profile" p WHERE p."id" = l."profileId" AND p."userId" = app_user_id())
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

-- Reserved wish ids among p_wish_ids on lists the caller wishes from and that are not in surprise mode,
-- in the caller's active family and only on lists the caller may see (private lists of others excluded).
CREATE FUNCTION app_wish_reserved_for_wisher(p_wish_ids text[])
  RETURNS SETOF text
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT DISTINCT r."wishId"
  FROM "wish_reservation" r
  JOIN "wish" w ON w."id" = r."wishId" AND w."familyId" = r."familyId"
  JOIN "wishlist" l ON l."id" = w."listId" AND l."familyId" = w."familyId"
  JOIN "family_profile" p ON p."id" = l."profileId" AND p."familyId" = l."familyId"
  WHERE r."wishId" = ANY (p_wish_ids)
    AND app_family_id() IS NOT NULL AND app_user_id() IS NOT NULL
    AND r."familyId" = app_family_id()
    AND p."userId" = app_user_id()
    AND NOT l."surprise"
    AND (l."visibility" = 'FAMILY' OR l."createdById" = app_user_id())
    AND EXISTS (SELECT 1 FROM "family_membership" m WHERE m."familyId" = r."familyId" AND m."userId" = app_user_id());
$$;
REVOKE ALL ON FUNCTION app_wish_reserved_for_wisher(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_wish_reserved_for_wisher(text[]) TO plan4ju_app;
