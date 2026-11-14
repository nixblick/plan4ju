-- 0.7.2 (review fixes)

-- A digest whose mail failed is given back, so a later run on the same day can try again.
CREATE FUNCTION app_digest_unclaim(p_user text, p_family text, p_day date)
  RETURNS void
  LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  UPDATE "notification_pref" SET "digestSentOn" = NULL
  WHERE "userId" = p_user AND "familyId" = p_family AND "digestSentOn" = p_day;
$$;
REVOKE ALL ON FUNCTION app_digest_unclaim(text, text, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_digest_unclaim(text, text, date) TO plan4ju_app;

-- Records the outcome of a claimed feedback attempt (see 20261204000000). Touches mailedAt, mailFailedAt,
-- mailNextAt and, once delivered, drops the screenshot (image, imageType): it went out as the mail attachment.
CREATE OR REPLACE FUNCTION app_feedback_finish(p_id text, p_mailed boolean, p_now timestamp)
  RETURNS void
  LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  UPDATE "feedback" SET
    "mailedAt" = CASE WHEN p_mailed THEN p_now END,
    "mailFailedAt" = CASE WHEN NOT p_mailed AND "mailAttempts" >= 5 THEN p_now END,
    "mailNextAt" = CASE WHEN p_mailed OR "mailAttempts" >= 5 THEN NULL ELSE "mailNextAt" END,
    "image" = CASE WHEN p_mailed THEN NULL ELSE "image" END,
    "imageType" = CASE WHEN p_mailed THEN NULL ELSE "imageType" END
  WHERE "id" = p_id AND "mailedAt" IS NULL AND "mailFailedAt" IS NULL;
$$;
REVOKE ALL ON FUNCTION app_feedback_finish(text, boolean, timestamp) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_feedback_finish(text, boolean, timestamp) TO plan4ju_app;
