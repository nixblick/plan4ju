-- Background refresh of ICS subscriptions (docs/kalender.md).
-- Per calendar: refresh interval in minutes, consecutive failures, pause after too many failures.
ALTER TABLE "external_calendar" ADD COLUMN "refreshMinutes" INTEGER NOT NULL DEFAULT 60;
ALTER TABLE "external_calendar" ADD COLUMN "failCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "external_calendar" ADD COLUMN "pausedAt" TIMESTAMP(3);
ALTER TABLE "external_calendar" ADD CONSTRAINT "external_calendar_refresh_minutes"
  CHECK ("refreshMinutes" IN (15, 60, 360, 1440));

-- Contextless entry point for the job: lists due subscriptions only (no update; syncCalendar claims
-- each row itself under RLS). The acting user is a current member: the creator if still in the family,
-- else the oldest owner, else the oldest member.
CREATE FUNCTION app_calendar_refresh_due(p_now timestamp, p_limit integer)
  RETURNS TABLE (calendar_id text, family_id text, user_id text)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT c."id", c."familyId", m."userId"
  FROM "external_calendar" c
  CROSS JOIN LATERAL (
    SELECT fm."userId" FROM "family_membership" fm
    WHERE fm."familyId" = c."familyId"
    ORDER BY (fm."userId" = c."createdById") DESC, (fm."role" = 'OWNER') DESC, fm."createdAt", fm."id"
    LIMIT 1
  ) m
  WHERE c."kind" = 'SUBSCRIPTION' AND c."enabled" AND c."pausedAt" IS NULL AND c."urlEnc" IS NOT NULL
    AND (c."lastAttemptAt" IS NULL OR c."lastAttemptAt" <= p_now - make_interval(mins => c."refreshMinutes"))
  ORDER BY c."lastAttemptAt" NULLS FIRST, c."id"
  LIMIT greatest(1, least(p_limit, 500));
$$;
REVOKE ALL ON FUNCTION app_calendar_refresh_due(timestamp, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_calendar_refresh_due(timestamp, integer) TO plan4ju_app;
