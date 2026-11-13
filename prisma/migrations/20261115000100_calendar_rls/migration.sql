-- Row level security for the calendar tables (same pattern as before): every row carries familyId
-- and is only visible and writable inside the active family.

GRANT SELECT, INSERT, UPDATE, DELETE ON
  "calendar_event", "calendar_event_participant", "external_calendar", "external_calendar_event"
  TO plan4ju_app;

ALTER TABLE "calendar_event" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "calendar_event" FORCE ROW LEVEL SECURITY;
CREATE POLICY family_scope ON "calendar_event"
  USING ("familyId" = app_family_id()) WITH CHECK ("familyId" = app_family_id());

ALTER TABLE "calendar_event_participant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "calendar_event_participant" FORCE ROW LEVEL SECURITY;
CREATE POLICY family_scope ON "calendar_event_participant"
  USING ("familyId" = app_family_id()) WITH CHECK ("familyId" = app_family_id());

ALTER TABLE "external_calendar" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "external_calendar" FORCE ROW LEVEL SECURITY;
CREATE POLICY family_scope ON "external_calendar"
  USING ("familyId" = app_family_id()) WITH CHECK ("familyId" = app_family_id());

ALTER TABLE "external_calendar_event" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "external_calendar_event" FORCE ROW LEVEL SECURITY;
CREATE POLICY family_scope ON "external_calendar_event"
  USING ("familyId" = app_family_id()) WITH CHECK ("familyId" = app_family_id());
