-- Retry of feedback mails (docs/feedback.md): attempts, next attempt, final failure after 5 attempts.
ALTER TABLE "feedback" ADD COLUMN "mailAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "feedback" ADD COLUMN "mailNextAt" TIMESTAMP(3);
ALTER TABLE "feedback" ADD COLUMN "mailFailedAt" TIMESTAMP(3);

-- Contextless entry point for the job: lists due feedback only (no update; the retry runs under RLS).
-- The acting user is the author if still a member, else the oldest owner, else the oldest member.
-- reply_to is the author's address only while the author is still a member of the family.
CREATE FUNCTION app_feedback_retry_due(p_now timestamp, p_limit integer)
  RETURNS TABLE (feedback_id text, family_id text, user_id text, reply_to text)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT f."id", f."familyId", m."userId", CASE WHEN m."userId" = f."userId" THEN u."email" END
  FROM "feedback" f
  CROSS JOIN LATERAL (
    SELECT fm."userId" FROM "family_membership" fm
    WHERE fm."familyId" = f."familyId"
    ORDER BY (fm."userId" = f."userId") DESC, (fm."role" = 'OWNER') DESC, fm."createdAt", fm."id"
    LIMIT 1
  ) m
  LEFT JOIN "user" u ON u."id" = f."userId"
  WHERE f."mailedAt" IS NULL AND f."mailFailedAt" IS NULL
    AND (f."mailNextAt" IS NULL OR f."mailNextAt" <= p_now)
  ORDER BY f."mailNextAt" NULLS FIRST, f."id"
  LIMIT greatest(1, least(p_limit, 500));
$$;
REVOKE ALL ON FUNCTION app_feedback_retry_due(timestamp, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_feedback_retry_due(timestamp, integer) TO plan4ju_app;
