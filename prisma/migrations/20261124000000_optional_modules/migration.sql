-- Optional modules (Release 0.5, docs/module.md): switched per family, off by default.
-- Prospekte: links to the retailers' own flyer pages (no fetching, nothing stored from them).
-- Abfall: one of the family's external calendars (ICS file or subscription) is marked as the waste calendar.
ALTER TABLE "family" ADD COLUMN "moduleFlyers" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "family" ADD COLUMN "moduleWaste" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "family" ADD COLUMN "flyerLinks" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "family" ADD COLUMN "wasteCalendarId" TEXT;

ALTER TABLE "family" ADD CONSTRAINT "family_flyer_links_array" CHECK (jsonb_typeof("flyerLinks") = 'array' AND jsonb_array_length("flyerLinks") <= 20);

-- The waste calendar must belong to the same family; deleting it clears the choice.
ALTER TABLE "family" ADD CONSTRAINT "family_waste_calendar_fkey"
  FOREIGN KEY ("wasteCalendarId", "id") REFERENCES "external_calendar"("id", "familyId")
  ON DELETE SET NULL ("wasteCalendarId");

-- Any member may update the family row (RLS); the module settings are for admins only, also below the app.
CREATE FUNCTION family_modules_admin_only() RETURNS trigger
  LANGUAGE plpgsql SET search_path = public
  AS $$
  BEGIN
    IF current_user = 'plan4ju_app'
       AND (NEW."moduleFlyers", NEW."moduleWaste", NEW."flyerLinks", NEW."wasteCalendarId")
           IS DISTINCT FROM (OLD."moduleFlyers", OLD."moduleWaste", OLD."flyerLinks", OLD."wasteCalendarId")
       AND NOT app_is_family_admin() THEN
      RAISE EXCEPTION 'module settings need an admin' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END;
  $$;
CREATE TRIGGER family_modules_admin_only BEFORE UPDATE ON "family"
  FOR EACH ROW EXECUTE FUNCTION family_modules_admin_only();
