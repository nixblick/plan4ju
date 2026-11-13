-- Invitations, administration and the owner role.
--
-- 1. Owner policies: FORCE ROW LEVEL SECURITY also binds the table owner. The owner
--    connection (administration CLI) and the SECURITY DEFINER functions below run as
--    owner, so the owner gets explicit all-access policies. This does not depend on the
--    owner being a superuser. The application role never matches these policies.
-- 2. Invitation lookup and acceptance by token hash. The invitee has no family context
--    yet, so both run as SECURITY DEFINER with a narrow, audited body.

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['family','family_membership','family_profile','family_invitation','task','task_assignment','birthday']
  LOOP
    EXECUTE format('CREATE POLICY owner_all ON %I TO %I USING (true) WITH CHECK (true)', t, current_user);
  END LOOP;
END
$$;

-- Read-only view of one invitation by token hash. Returns nothing for unknown hashes.
CREATE FUNCTION app_invitation_lookup(p_hash text)
  RETURNS TABLE (
    id text, family_id text, family_name text, email text, role "FamilyRole",
    expires_at timestamp, accepted_at timestamp, revoked_at timestamp, account_exists boolean
  )
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$
    SELECT i."id", i."familyId", f."name", i."email", i."role", i."expiresAt", i."acceptedAt", i."revokedAt",
           EXISTS (SELECT 1 FROM "user" u WHERE lower(u."email") = lower(i."email"))
    FROM "family_invitation" i JOIN "family" f ON f."id" = i."familyId"
    WHERE i."tokenHash" = p_hash
  $$;

-- Single-use acceptance. The caller must be the user named by app.user_id and own the
-- invited e-mail address. The UPDATE ... WHERE acceptedAt IS NULL makes the token
-- one-shot even under concurrent requests. Returns the family id.
CREATE FUNCTION app_invitation_accept(p_hash text, p_user text) RETURNS text
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
  AS $$
DECLARE
  v_inv "family_invitation"%ROWTYPE;
  v_user "user"%ROWTYPE;
BEGIN
  IF p_user IS NULL OR p_user IS DISTINCT FROM app_user_id() THEN
    RAISE EXCEPTION 'invitation: wrong user' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_user FROM "user" WHERE "id" = p_user;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invitation: unknown user' USING ERRCODE = '42501';
  END IF;

  UPDATE "family_invitation" SET "acceptedAt" = (now() AT TIME ZONE 'UTC')
  WHERE "tokenHash" = p_hash AND "acceptedAt" IS NULL AND "revokedAt" IS NULL
    AND "expiresAt" > (now() AT TIME ZONE 'UTC') AND lower("email") = lower(v_user."email")
  RETURNING * INTO v_inv;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invitation: invalid' USING ERRCODE = 'P0001';
  END IF;

  -- The link was delivered to this address, which proves ownership of it.
  UPDATE "user" SET "emailVerified" = true WHERE "id" = p_user AND NOT "emailVerified";

  INSERT INTO "family_membership" ("id", "familyId", "userId", "role")
  VALUES ('m' || replace(gen_random_uuid()::text, '-', ''), v_inv."familyId", p_user, v_inv."role")
  ON CONFLICT ("familyId", "userId") DO NOTHING;

  INSERT INTO "family_profile" ("id", "familyId", "userId", "displayName", "isChild", "updatedAt")
  VALUES ('p' || replace(gen_random_uuid()::text, '-', ''), v_inv."familyId", p_user, v_user."name", false, (now() AT TIME ZONE 'UTC'))
  ON CONFLICT ("familyId", "userId") DO NOTHING;

  RETURN v_inv."familyId";
END
$$;

REVOKE ALL ON FUNCTION app_invitation_lookup(text), app_invitation_accept(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_invitation_lookup(text), app_invitation_accept(text, text) TO plan4ju_app;
