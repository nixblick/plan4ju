-- Row level security for assignment acceptance. family_scope on task_assignment is permissive; these
-- policies are RESTRICTIVE, so they narrow it instead of widening it:
--   INSERT  the assigning person is the current user, and an ACCEPTED row is only allowed for the own
--           profile or a child profile without login (nobody accepts on behalf of another member).
--   UPDATE  only the assigned person changes the row (accepting).
-- task_decline: the declining person writes, only the two people involved read.

CREATE POLICY assignment_insert_guard ON "task_assignment" AS RESTRICTIVE FOR INSERT
  WITH CHECK (
    "assignedById" = app_user_id()
    AND (
      "state" = 'PENDING'
      OR EXISTS (
        SELECT 1 FROM "family_profile" p
        WHERE p."id" = "profileId" AND p."familyId" = app_family_id()
          AND (p."userId" = app_user_id() OR (p."isChild" AND p."userId" IS NULL)))
    )
  );

CREATE POLICY assignment_update_guard ON "task_assignment" AS RESTRICTIVE FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM "family_profile" p
    WHERE p."id" = "profileId" AND p."familyId" = app_family_id() AND p."userId" = app_user_id()))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "family_profile" p
    WHERE p."id" = "profileId" AND p."familyId" = app_family_id() AND p."userId" = app_user_id()));

GRANT SELECT, INSERT ON "task_decline" TO plan4ju_app;

ALTER TABLE "task_decline" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "task_decline" FORCE ROW LEVEL SECURITY;

CREATE POLICY decline_select ON "task_decline" FOR SELECT
  USING ("familyId" = app_family_id() AND ("assignedById" = app_user_id() OR "declinedById" = app_user_id()));

CREATE POLICY decline_insert ON "task_decline" FOR INSERT
  WITH CHECK (
    "familyId" = app_family_id()
    AND "declinedById" = app_user_id()
    AND EXISTS (SELECT 1 FROM "family_profile" p
      WHERE p."id" = "profileId" AND p."familyId" = app_family_id() AND p."userId" = app_user_id())
  );
