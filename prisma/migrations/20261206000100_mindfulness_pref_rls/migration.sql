-- Row level security for the mindfulness setting: strictly the own row, no role sees another member's.
GRANT SELECT, INSERT, UPDATE, DELETE ON "mindfulness_pref" TO plan4ju_app;
ALTER TABLE "mindfulness_pref" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "mindfulness_pref" FORCE ROW LEVEL SECURITY;
CREATE POLICY own_rows ON "mindfulness_pref"
  USING ("familyId" = app_family_id() AND "userId" = app_user_id())
  WITH CHECK ("familyId" = app_family_id() AND "userId" = app_user_id());
