-- Release 0.5: the 0.4 features become switchable per family too (docs/module.md).
-- They stay on by default, so existing families keep everything. Switching off hides, never deletes.
ALTER TABLE "family" ADD COLUMN "moduleMap" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "family" ADD COLUMN "moduleWishes" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "family" ADD COLUMN "moduleMindfulness" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "family" ADD COLUMN "moduleMeals" BOOLEAN NOT NULL DEFAULT true;

-- The admin-only trigger covers the new switches as well.
CREATE OR REPLACE FUNCTION family_modules_admin_only() RETURNS trigger
  LANGUAGE plpgsql SET search_path = public
  AS $$
  BEGIN
    IF current_user = 'plan4ju_app'
       AND (NEW."moduleFlyers", NEW."moduleWaste", NEW."flyerLinks", NEW."wasteCalendarId",
            NEW."moduleMap", NEW."moduleWishes", NEW."moduleMindfulness", NEW."moduleMeals")
           IS DISTINCT FROM (OLD."moduleFlyers", OLD."moduleWaste", OLD."flyerLinks", OLD."wasteCalendarId",
            OLD."moduleMap", OLD."moduleWishes", OLD."moduleMindfulness", OLD."moduleMeals")
       AND NOT app_is_family_admin() THEN
      RAISE EXCEPTION 'module settings need an admin' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END;
  $$;
