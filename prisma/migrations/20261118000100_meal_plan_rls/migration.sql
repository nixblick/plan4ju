-- Row level security for the meal plan tables (same pattern as the recipe tables).

GRANT SELECT, INSERT, UPDATE, DELETE ON "meal_slot", "meal", "meal_cook" TO plan4ju_app;

ALTER TABLE "meal_slot" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "meal_slot" FORCE ROW LEVEL SECURITY;
CREATE POLICY family_scope ON "meal_slot"
  USING ("familyId" = app_family_id()) WITH CHECK ("familyId" = app_family_id());

ALTER TABLE "meal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "meal" FORCE ROW LEVEL SECURITY;
CREATE POLICY family_scope ON "meal"
  USING ("familyId" = app_family_id()) WITH CHECK ("familyId" = app_family_id());

ALTER TABLE "meal_cook" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "meal_cook" FORCE ROW LEVEL SECURITY;
CREATE POLICY family_scope ON "meal_cook"
  USING ("familyId" = app_family_id()) WITH CHECK ("familyId" = app_family_id());
