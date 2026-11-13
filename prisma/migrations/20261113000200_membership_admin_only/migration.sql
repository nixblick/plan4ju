-- Membership writes only by an OWNER or ADMIN of the active family.
-- Before this, any member could raise their own role or add other users.
-- The check runs as SECURITY DEFINER to avoid recursive RLS on family_membership;
-- it only reads the current user's own membership in the active family.

CREATE FUNCTION app_is_family_admin() RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$
    SELECT EXISTS (
      SELECT 1 FROM "family_membership"
      WHERE "familyId" = app_family_id() AND "userId" = app_user_id()
        AND "role" IN ('OWNER', 'ADMIN')
    )
  $$;
REVOKE ALL ON FUNCTION app_is_family_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_is_family_admin() TO plan4ju_app;

DROP POLICY membership_insert ON "family_membership";
DROP POLICY membership_update ON "family_membership";
DROP POLICY membership_delete ON "family_membership";

CREATE POLICY membership_insert ON "family_membership" FOR INSERT
  WITH CHECK ("familyId" = app_family_id() AND app_is_family_admin());
CREATE POLICY membership_update ON "family_membership" FOR UPDATE
  USING ("familyId" = app_family_id() AND app_is_family_admin())
  WITH CHECK ("familyId" = app_family_id() AND app_is_family_admin());
CREATE POLICY membership_delete ON "family_membership" FOR DELETE
  USING ("familyId" = app_family_id() AND app_is_family_admin());
