-- Row level security for the shopping list tables (same pattern as the meal plan tables).

GRANT SELECT, INSERT, UPDATE, DELETE ON "shop", "shopping_item", "shopping_item_shop" TO plan4ju_app;

ALTER TABLE "shop" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "shop" FORCE ROW LEVEL SECURITY;
CREATE POLICY family_scope ON "shop"
  USING ("familyId" = app_family_id()) WITH CHECK ("familyId" = app_family_id());

ALTER TABLE "shopping_item" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "shopping_item" FORCE ROW LEVEL SECURITY;
CREATE POLICY family_scope ON "shopping_item"
  USING ("familyId" = app_family_id()) WITH CHECK ("familyId" = app_family_id());

ALTER TABLE "shopping_item_shop" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "shopping_item_shop" FORCE ROW LEVEL SECURITY;
CREATE POLICY family_scope ON "shopping_item_shop"
  USING ("familyId" = app_family_id()) WITH CHECK ("familyId" = app_family_id());
