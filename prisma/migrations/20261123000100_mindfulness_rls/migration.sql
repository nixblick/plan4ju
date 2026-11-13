-- Row level security for mindfulness. Own policies per command, not just the family scope:
--   SELECT   the author, or everyone in the family for FAMILY, or a selected viewer for SELECTED.
--            No role gets more: owners and admins see exactly what any member sees.
--   INSERT   only as author, and only for the own profile or a child profile without login.
--   UPDATE   only the author, the same profile rule applies to the new row.
--   DELETE   only the author.
-- mindfulness_share never reads mindfulness_entry in its policies (that would recurse); its ownerId is
-- tied to the entry author by the composite foreign key. See docs/achtsamkeit.md.

GRANT SELECT, INSERT, UPDATE, DELETE ON "mindfulness_entry", "mindfulness_share" TO plan4ju_app;

ALTER TABLE "mindfulness_entry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "mindfulness_entry" FORCE ROW LEVEL SECURITY;

CREATE POLICY mindful_select ON "mindfulness_entry" FOR SELECT
  USING (
    "familyId" = app_family_id()
    AND (
      "createdById" = app_user_id()
      OR "visibility" = 'FAMILY'
      OR ("visibility" = 'SELECTED' AND EXISTS (
        SELECT 1 FROM "mindfulness_share" s
        WHERE s."entryId" = "mindfulness_entry"."id" AND s."userId" = app_user_id()))
    )
  );

CREATE POLICY mindful_insert ON "mindfulness_entry" FOR INSERT
  WITH CHECK (
    "familyId" = app_family_id()
    AND "createdById" = app_user_id()
    AND EXISTS (
      SELECT 1 FROM "family_profile" p
      WHERE p."id" = "mindfulness_entry"."profileId"
        AND (p."userId" = app_user_id() OR (p."isChild" AND p."userId" IS NULL)))
  );

CREATE POLICY mindful_update ON "mindfulness_entry" FOR UPDATE
  USING ("familyId" = app_family_id() AND "createdById" = app_user_id())
  WITH CHECK (
    "familyId" = app_family_id()
    AND "createdById" = app_user_id()
    AND EXISTS (
      SELECT 1 FROM "family_profile" p
      WHERE p."id" = "mindfulness_entry"."profileId"
        AND (p."userId" = app_user_id() OR (p."isChild" AND p."userId" IS NULL)))
  );

CREATE POLICY mindful_delete ON "mindfulness_entry" FOR DELETE
  USING ("familyId" = app_family_id() AND "createdById" = app_user_id());

ALTER TABLE "mindfulness_share" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "mindfulness_share" FORCE ROW LEVEL SECURITY;

CREATE POLICY share_select ON "mindfulness_share" FOR SELECT
  USING ("familyId" = app_family_id() AND ("ownerId" = app_user_id() OR "userId" = app_user_id()));

CREATE POLICY share_insert ON "mindfulness_share" FOR INSERT
  WITH CHECK ("familyId" = app_family_id() AND "ownerId" = app_user_id());

CREATE POLICY share_delete ON "mindfulness_share" FOR DELETE
  USING ("familyId" = app_family_id() AND "ownerId" = app_user_id());
