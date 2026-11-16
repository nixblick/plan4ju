-- Release 0.9 acceptance: the shared wish list also offers the image link of a wish.
CREATE OR REPLACE FUNCTION app_wishlist_share_lookup(p_hash text)
  RETURNS jsonb
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT jsonb_build_object(
    'ownerName', split_part(btrim(COALESCE(p."displayName", l."personName", '')), ' ', 1),
    'wishes', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
          'title', w."title", 'description', w."description", 'url', w."url", 'priceCents', w."priceCents", 'imageUrl', w."imageUrl",
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
