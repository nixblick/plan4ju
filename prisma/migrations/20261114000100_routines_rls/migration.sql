-- Row level security for the routine tables (same pattern as the first RLS migration):
-- every row carries familyId and is only visible and writable inside the active family.

GRANT SELECT, INSERT, UPDATE, DELETE ON
  "routine", "routine_assignment", "routine_occurrence", "routine_occurrence_assignment"
  TO plan4ju_app;

ALTER TABLE "routine" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "routine" FORCE ROW LEVEL SECURITY;
CREATE POLICY family_scope ON "routine"
  USING ("familyId" = app_family_id()) WITH CHECK ("familyId" = app_family_id());

ALTER TABLE "routine_assignment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "routine_assignment" FORCE ROW LEVEL SECURITY;
CREATE POLICY family_scope ON "routine_assignment"
  USING ("familyId" = app_family_id()) WITH CHECK ("familyId" = app_family_id());

ALTER TABLE "routine_occurrence" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "routine_occurrence" FORCE ROW LEVEL SECURITY;
CREATE POLICY family_scope ON "routine_occurrence"
  USING ("familyId" = app_family_id()) WITH CHECK ("familyId" = app_family_id());

ALTER TABLE "routine_occurrence_assignment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "routine_occurrence_assignment" FORCE ROW LEVEL SECURITY;
CREATE POLICY family_scope ON "routine_occurrence_assignment"
  USING ("familyId" = app_family_id()) WITH CHECK ("familyId" = app_family_id());
