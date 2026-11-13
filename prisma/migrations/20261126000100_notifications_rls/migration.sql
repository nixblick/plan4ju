-- Row level security for notifications, settings and calendar feeds: strictly per user inside the family.
-- Nobody, not even an owner, sees or writes rows of another member. Notifications are generated lazily
-- for the signed-in user only, so no cross-user insert is needed.
-- Two narrow SECURITY DEFINER functions serve the contextless entry points (docs/benachrichtigungen.md):
--   app_calendar_feed_lookup(hash)  feed token -> (user, family), only for a still existing membership.
--   app_digest_claim(day)           marks due daily digests as sent and returns (user, family) pairs.

GRANT SELECT, INSERT, UPDATE, DELETE ON "notification", "notification_pref", "calendar_feed" TO plan4ju_app;

ALTER TABLE "notification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notification" FORCE ROW LEVEL SECURITY;
CREATE POLICY own_rows ON "notification"
  USING ("familyId" = app_family_id() AND "userId" = app_user_id())
  WITH CHECK ("familyId" = app_family_id() AND "userId" = app_user_id());

ALTER TABLE "notification_pref" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notification_pref" FORCE ROW LEVEL SECURITY;
CREATE POLICY own_rows ON "notification_pref"
  USING ("familyId" = app_family_id() AND "userId" = app_user_id())
  WITH CHECK ("familyId" = app_family_id() AND "userId" = app_user_id());

ALTER TABLE "calendar_feed" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "calendar_feed" FORCE ROW LEVEL SECURITY;
CREATE POLICY own_rows ON "calendar_feed"
  USING ("familyId" = app_family_id() AND "userId" = app_user_id())
  WITH CHECK ("familyId" = app_family_id() AND "userId" = app_user_id());

CREATE FUNCTION app_calendar_feed_lookup(p_hash text)
  RETURNS TABLE (user_id text, family_id text)
  LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  UPDATE "calendar_feed" f SET "lastUsedAt" = now()
  WHERE f."tokenHash" = p_hash
    AND EXISTS (SELECT 1 FROM "family_membership" m WHERE m."familyId" = f."familyId" AND m."userId" = f."userId")
  RETURNING f."userId", f."familyId";
$$;
REVOKE ALL ON FUNCTION app_calendar_feed_lookup(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_calendar_feed_lookup(text) TO plan4ju_app;

CREATE FUNCTION app_digest_claim(p_day date)
  RETURNS TABLE (user_id text, family_id text)
  LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  UPDATE "notification_pref" p SET "digestSentOn" = p_day
  WHERE p."emailDigest" AND (p."digestSentOn" IS NULL OR p."digestSentOn" < p_day)
  RETURNING p."userId", p."familyId";
$$;
REVOKE ALL ON FUNCTION app_digest_claim(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_digest_claim(date) TO plan4ju_app;
