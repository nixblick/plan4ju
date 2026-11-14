-- Retry bookkeeping without RLS on the author: counts the attempt BEFORE the mail goes out, so a crash or
-- an author who left the family can never cause endless resends. Only mailAttempts, mailNextAt, mailedAt
-- and mailFailedAt are touched.

-- Claims one attempt. Returns the new attempt number, or NULL if the row must not be sent (already mailed,
-- failed, claimed by someone else, out of attempts, or the author is no longer a member: then marked failed).
CREATE FUNCTION app_feedback_claim(p_id text, p_expected integer, p_now timestamp)
  RETURNS integer
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_attempts integer;
  v_backoff integer[] := ARRAY[5, 30, 120, 720];
BEGIN
  -- Author left the family: give up at once.
  UPDATE "feedback" f SET "mailFailedAt" = p_now, "mailNextAt" = NULL
  WHERE f."id" = p_id AND f."mailedAt" IS NULL AND f."mailFailedAt" IS NULL
    AND NOT EXISTS (SELECT 1 FROM "family_membership" fm WHERE fm."familyId" = f."familyId" AND fm."userId" = f."userId");
  IF FOUND THEN RETURN NULL; END IF;
  -- Out of attempts (e.g. a crash after the fifth claim): mark failed.
  UPDATE "feedback" SET "mailFailedAt" = p_now, "mailNextAt" = NULL
  WHERE "id" = p_id AND "mailedAt" IS NULL AND "mailFailedAt" IS NULL AND "mailAttempts" >= 5;
  IF FOUND THEN RETURN NULL; END IF;
  UPDATE "feedback" SET "mailAttempts" = "mailAttempts" + 1,
    "mailNextAt" = p_now + make_interval(mins => v_backoff[least("mailAttempts" + 1, 4)])
  WHERE "id" = p_id AND "mailedAt" IS NULL AND "mailFailedAt" IS NULL AND "mailAttempts" = p_expected
  RETURNING "mailAttempts" INTO v_attempts;
  RETURN v_attempts;
END;
$$;
REVOKE ALL ON FUNCTION app_feedback_claim(text, integer, timestamp) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_feedback_claim(text, integer, timestamp) TO plan4ju_app;

-- Records the outcome of a claimed attempt: delivered, or failed for good after the fifth attempt.
CREATE FUNCTION app_feedback_finish(p_id text, p_mailed boolean, p_now timestamp)
  RETURNS void
  LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  UPDATE "feedback" SET
    "mailedAt" = CASE WHEN p_mailed THEN p_now END,
    "mailFailedAt" = CASE WHEN NOT p_mailed AND "mailAttempts" >= 5 THEN p_now END,
    "mailNextAt" = CASE WHEN p_mailed OR "mailAttempts" >= 5 THEN NULL ELSE "mailNextAt" END
  WHERE "id" = p_id AND "mailedAt" IS NULL AND "mailFailedAt" IS NULL;
$$;
REVOKE ALL ON FUNCTION app_feedback_finish(text, boolean, timestamp) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_feedback_finish(text, boolean, timestamp) TO plan4ju_app;
