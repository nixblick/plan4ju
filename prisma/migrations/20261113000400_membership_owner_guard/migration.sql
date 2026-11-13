-- Owner rows only for owners, and a family keeps at least one owner.
-- Before this, any ADMIN could create, promote to, demote or delete OWNER memberships.
-- The rules now match src/server/permissions.ts (canGrant/canManage):
--   OWNER writes any membership row of the active family,
--   ADMIN writes only MEMBER rows (old row in USING, new row in WITH CHECK),
--   MEMBER writes nothing.
-- The table owner (administration, SECURITY DEFINER functions such as app_invitation_accept)
-- keeps its own owner_all policy and is not affected by these app-role policies.

-- Role of the current user in the active family, NULL if none. SECURITY DEFINER avoids
-- recursive RLS on family_membership; it reads only the caller's own membership row.
CREATE FUNCTION app_family_role() RETURNS "FamilyRole"
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
    SELECT "role" FROM "family_membership"
    WHERE "familyId" = app_family_id() AND "userId" = app_user_id()
  $$;
REVOKE ALL ON FUNCTION app_family_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_family_role() TO plan4ju_app;

DROP POLICY membership_insert ON "family_membership";
DROP POLICY membership_update ON "family_membership";
DROP POLICY membership_delete ON "family_membership";

CREATE POLICY membership_insert ON "family_membership" FOR INSERT
  WITH CHECK ("familyId" = app_family_id()
    AND (app_family_role() = 'OWNER' OR (app_family_role() = 'ADMIN' AND "role" = 'MEMBER')));
CREATE POLICY membership_update ON "family_membership" FOR UPDATE
  USING ("familyId" = app_family_id()
    AND (app_family_role() = 'OWNER' OR (app_family_role() = 'ADMIN' AND "role" = 'MEMBER')))
  WITH CHECK ("familyId" = app_family_id()
    AND (app_family_role() = 'OWNER' OR (app_family_role() = 'ADMIN' AND "role" = 'MEMBER')));
CREATE POLICY membership_delete ON "family_membership" FOR DELETE
  USING ("familyId" = app_family_id()
    AND (app_family_role() = 'OWNER' OR (app_family_role() = 'ADMIN' AND "role" = 'MEMBER')));

-- The last owner of a family can be neither removed nor demoted, by anyone. Deleting the
-- whole family (cascade) is still possible: the check only applies while the family exists.
-- The family row is locked so that two owners cannot demote each other concurrently.
CREATE FUNCTION app_keep_last_owner() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
BEGIN
  IF OLD."role" <> 'OWNER' THEN
    RETURN NULL;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW."role" = 'OWNER' AND NEW."familyId" = OLD."familyId" THEN
    RETURN NULL;
  END IF;
  PERFORM 1 FROM "family" WHERE "id" = OLD."familyId" FOR UPDATE;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "family_membership" WHERE "familyId" = OLD."familyId" AND "role" = 'OWNER'
  ) THEN
    RAISE EXCEPTION 'family needs at least one owner' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END
$$;
REVOKE ALL ON FUNCTION app_keep_last_owner() FROM PUBLIC;

CREATE TRIGGER membership_keep_last_owner
  AFTER UPDATE OR DELETE ON "family_membership"
  FOR EACH ROW EXECUTE FUNCTION app_keep_last_owner();
