-- Privacy: delete the own account and (as owner) the whole active family. docs/datenschutz.md
--
-- Both functions take no arguments and act only on the request context (app.user_id,
-- app.family_id), so a caller cannot name someone else's account or family. They run as
-- SECURITY DEFINER because the app role has no DELETE on "family", "feedback" and
-- "wish_reservation"; the bodies are narrow on purpose.
--
-- Foreign key cascades (sessions, accounts, memberships -> mindfulness, shares,
-- notifications, preferences, calendar feeds; family -> every family table) are not subject
-- to row level security. The direct deletes below are, under FORCE: the owner therefore needs
-- explicit owner_all policies on the tables it deletes from that do not have one yet
-- (pattern of 20261113000300), so this also works when the owner is no superuser.

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['feedback','wish_reservation']
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = t AND policyname = 'owner_all') THEN
      EXECUTE format('CREATE POLICY owner_all ON %I TO %I USING (true) WITH CHECK (true)', t, current_user);
    END IF;
  END LOOP;
END
$$;

-- Deletes the calling user's account. Refuses while the user is the last owner of a family
-- (hand over or delete the family first); the trigger app_keep_last_owner would refuse too.
-- Content the user created for the family (tasks, events, recipes, ...) stays family data.
CREATE FUNCTION app_delete_own_account() RETURNS void
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
DECLARE
  uid text := app_user_id();
  mail text;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'no user context' USING ERRCODE = '42501';
  END IF;
  SELECT "email" INTO mail FROM "user" WHERE "id" = uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'user not found' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "family_membership" m
    WHERE m."userId" = uid AND m."role" = 'OWNER'
      AND NOT EXISTS (SELECT 1 FROM "family_membership" o
                      WHERE o."familyId" = m."familyId" AND o."role" = 'OWNER' AND o."userId" <> uid)
  ) THEN
    RAISE EXCEPTION 'family needs at least one owner' USING ERRCODE = '23514';
  END IF;

  DELETE FROM "feedback" WHERE "userId" = uid;
  DELETE FROM "wish_reservation" WHERE "reservedById" = uid;
  DELETE FROM "family_invitation" WHERE lower("email") = lower(mail);
  UPDATE "family_profile" SET "userId" = NULL WHERE "userId" = uid;
  DELETE FROM "verification" WHERE "value" = uid OR "identifier" = mail;
  DELETE FROM "user" WHERE "id" = uid;

  -- Guard: a silent zero-row delete (missing policy) must not look like success.
  IF EXISTS (SELECT 1 FROM "user" WHERE "id" = uid)
     OR EXISTS (SELECT 1 FROM "family_membership" WHERE "userId" = uid)
     OR EXISTS (SELECT 1 FROM "feedback" WHERE "userId" = uid)
     OR EXISTS (SELECT 1 FROM "wish_reservation" WHERE "reservedById" = uid)
     OR EXISTS (SELECT 1 FROM "family_profile" WHERE "userId" = uid) THEN
    RAISE EXCEPTION 'account data left after delete' USING ERRCODE = 'P0001';
  END IF;
END
$$;
REVOKE ALL ON FUNCTION app_delete_own_account() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_delete_own_account() TO plan4ju_app;

-- Deletes the active family with everything in it. Only an OWNER of that family.
CREATE FUNCTION app_delete_active_family() RETURNS void
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
DECLARE
  fid text := app_family_id();
BEGIN
  IF fid IS NULL OR app_user_id() IS NULL OR app_family_role() IS DISTINCT FROM 'OWNER' THEN
    RAISE EXCEPTION 'only an owner may delete the family' USING ERRCODE = '42501';
  END IF;
  DELETE FROM "family" WHERE "id" = fid;
  IF EXISTS (SELECT 1 FROM "family" WHERE "id" = fid) THEN
    RAISE EXCEPTION 'family left after delete' USING ERRCODE = 'P0001';
  END IF;
END
$$;
REVOKE ALL ON FUNCTION app_delete_active_family() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_delete_active_family() TO plan4ju_app;
