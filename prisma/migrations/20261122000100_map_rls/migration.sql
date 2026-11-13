-- Row level security for the map tables: plain family scope, all points are shared within the family.

GRANT SELECT, INSERT, UPDATE, DELETE ON "map_category", "poi" TO plan4ju_app;

ALTER TABLE "map_category" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "map_category" FORCE ROW LEVEL SECURITY;
CREATE POLICY family_scope ON "map_category"
  USING ("familyId" = app_family_id())
  WITH CHECK ("familyId" = app_family_id());

ALTER TABLE "poi" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "poi" FORCE ROW LEVEL SECURITY;
CREATE POLICY family_scope ON "poi"
  USING ("familyId" = app_family_id())
  WITH CHECK ("familyId" = app_family_id());
