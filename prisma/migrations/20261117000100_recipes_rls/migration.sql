-- Row level security for the recipe tables (same pattern as the calendar tables).

GRANT SELECT, INSERT, UPDATE, DELETE ON "recipe", "recipe_ingredient" TO plan4ju_app;

ALTER TABLE "recipe" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "recipe" FORCE ROW LEVEL SECURITY;
CREATE POLICY family_scope ON "recipe"
  USING ("familyId" = app_family_id()) WITH CHECK ("familyId" = app_family_id());

ALTER TABLE "recipe_ingredient" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "recipe_ingredient" FORCE ROW LEVEL SECURITY;
CREATE POLICY family_scope ON "recipe_ingredient"
  USING ("familyId" = app_family_id()) WITH CHECK ("familyId" = app_family_id());
