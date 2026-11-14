-- Release 0.8 (customer feedback): school and stars become switchable modules, a dashboard setting per user,
-- and categories on the shopping list with a per-family memory of manual choices.

-- "Schule heute" and "Sterne": existing families keep them on, new families start with both off.
ALTER TABLE "family" ADD COLUMN "moduleSchool" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "family" ADD COLUMN "moduleStars" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "family" ALTER COLUMN "moduleSchool" SET DEFAULT false;
ALTER TABLE "family" ALTER COLUMN "moduleStars" SET DEFAULT false;

-- The admin-only trigger covers the new switches as well.
CREATE OR REPLACE FUNCTION family_modules_admin_only() RETURNS trigger
  LANGUAGE plpgsql SET search_path = public
  AS $$
  BEGIN
    IF current_user = 'plan4ju_app'
       AND (NEW."moduleFlyers", NEW."moduleWaste", NEW."flyerLinks", NEW."wasteCalendarId",
            NEW."moduleMap", NEW."moduleWishes", NEW."moduleMindfulness", NEW."moduleMeals",
            NEW."moduleSchool", NEW."moduleStars")
           IS DISTINCT FROM (OLD."moduleFlyers", OLD."moduleWaste", OLD."flyerLinks", OLD."wasteCalendarId",
            OLD."moduleMap", OLD."moduleWishes", OLD."moduleMindfulness", OLD."moduleMeals",
            OLD."moduleSchool", OLD."moduleStars")
       AND NOT app_is_family_admin() THEN
      RAISE EXCEPTION 'module settings need an admin' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END;
  $$;

-- Dashboard elements a user hides (opt-out list), per user and family. Strictly the own row.
CREATE TABLE "dashboard_pref" (
    "familyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "hidden" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "dashboard_pref_pkey" PRIMARY KEY ("familyId", "userId"),
    CONSTRAINT "dashboard_pref_hidden_check" CHECK (cardinality("hidden") <= 30)
);
ALTER TABLE "dashboard_pref" ADD CONSTRAINT "dashboard_pref_membership_fkey"
  FOREIGN KEY ("familyId", "userId") REFERENCES "family_membership"("familyId", "userId") ON DELETE CASCADE ON UPDATE CASCADE;
GRANT SELECT, INSERT, UPDATE, DELETE ON "dashboard_pref" TO plan4ju_app;
ALTER TABLE "dashboard_pref" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dashboard_pref" FORCE ROW LEVEL SECURITY;
CREATE POLICY own_rows ON "dashboard_pref"
  USING ("familyId" = app_family_id() AND "userId" = app_user_id())
  WITH CHECK ("familyId" = app_family_id() AND "userId" = app_user_id());

-- Shopping categories: the column holds a manual choice only; without one the category is derived when reading.
ALTER TABLE "shopping_item" ADD COLUMN "category" TEXT;
ALTER TABLE "shopping_item" ADD CONSTRAINT "shopping_item_category_check" CHECK ("category" IS NULL OR "category" IN
  ('FLEISCH','WURST','FISCH','KAESE','GEMUESE','OBST','GETRAENKE','GEWUERZ','TIEFKUEHL','SUESSIGKEITEN','KONSERVEN','SONSTIGES'));

-- Manual choices are remembered per family and item name, so the same name lands in the same category next time.
CREATE TABLE "shopping_category_memo" (
    "familyId" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "shopping_category_memo_pkey" PRIMARY KEY ("familyId", "nameKey"),
    CONSTRAINT "shopping_category_memo_key_check" CHECK (char_length("nameKey") BETWEEN 1 AND 200),
    CONSTRAINT "shopping_category_memo_category_check" CHECK ("category" IN
      ('FLEISCH','WURST','FISCH','KAESE','GEMUESE','OBST','GETRAENKE','GEWUERZ','TIEFKUEHL','SUESSIGKEITEN','KONSERVEN','SONSTIGES'))
);
ALTER TABLE "shopping_category_memo" ADD CONSTRAINT "shopping_category_memo_familyId_fkey"
  FOREIGN KEY ("familyId") REFERENCES "family"("id") ON DELETE CASCADE ON UPDATE CASCADE;
GRANT SELECT, INSERT, UPDATE, DELETE ON "shopping_category_memo" TO plan4ju_app;
ALTER TABLE "shopping_category_memo" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "shopping_category_memo" FORCE ROW LEVEL SECURITY;
CREATE POLICY family_scope ON "shopping_category_memo"
  USING ("familyId" = app_family_id()) WITH CHECK ("familyId" = app_family_id());
