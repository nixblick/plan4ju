-- Row level security for all family-scoped tables.
--
-- Roles: the migration user owns all tables. The application connects as
-- "plan4ju_app" (no BYPASSRLS, not an owner), so policies always apply to it.
-- Request context is set per transaction with set_config(..., true) (= SET LOCAL):
--   app.family_id  active family
--   app.user_id    authenticated user
-- Outside a transaction that sets them, both read as NULL and every policy
-- denies. The settings cannot leak between pooled connections because
-- transaction-local values are discarded at COMMIT/ROLLBACK.
-- New tables need their own grants and policies in their own migration.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'plan4ju_app') THEN
    CREATE ROLE plan4ju_app NOLOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO plan4ju_app;

CREATE FUNCTION app_family_id() RETURNS text
  LANGUAGE sql STABLE
  AS $$ SELECT NULLIF(current_setting('app.family_id', true), '') $$;

CREATE FUNCTION app_user_id() RETURNS text
  LANGUAGE sql STABLE
  AS $$ SELECT NULLIF(current_setting('app.user_id', true), '') $$;

GRANT EXECUTE ON FUNCTION app_family_id(), app_user_id() TO plan4ju_app;

-- Authentication tables are not family data; Better Auth needs them before a family is chosen.
GRANT SELECT, INSERT, UPDATE, DELETE ON "user", "session", "account", "verification" TO plan4ju_app;

-- Family: visible when active, or when the current user is a member (family picker).
-- Creating and deleting families is an administrative task (owner connection).
GRANT SELECT, UPDATE ON "family" TO plan4ju_app;
ALTER TABLE "family" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "family" FORCE ROW LEVEL SECURITY;
CREATE POLICY family_select ON "family" FOR SELECT USING (
  "id" = app_family_id()
  OR EXISTS (SELECT 1 FROM "family_membership" m WHERE m."familyId" = "family"."id" AND m."userId" = app_user_id())
);
CREATE POLICY family_update ON "family" FOR UPDATE
  USING ("id" = app_family_id()) WITH CHECK ("id" = app_family_id());

-- Membership: a user may list their own memberships; writes only inside the active family.
GRANT SELECT, INSERT, UPDATE, DELETE ON "family_membership" TO plan4ju_app;
ALTER TABLE "family_membership" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "family_membership" FORCE ROW LEVEL SECURITY;
CREATE POLICY membership_select ON "family_membership" FOR SELECT
  USING ("familyId" = app_family_id() OR "userId" = app_user_id());
CREATE POLICY membership_insert ON "family_membership" FOR INSERT
  WITH CHECK ("familyId" = app_family_id());
CREATE POLICY membership_update ON "family_membership" FOR UPDATE
  USING ("familyId" = app_family_id()) WITH CHECK ("familyId" = app_family_id());
CREATE POLICY membership_delete ON "family_membership" FOR DELETE
  USING ("familyId" = app_family_id());

-- Plain family-scoped tables.
GRANT SELECT, INSERT, UPDATE, DELETE ON "family_profile", "family_invitation", "task", "birthday", "task_assignment" TO plan4ju_app;

ALTER TABLE "family_profile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "family_profile" FORCE ROW LEVEL SECURITY;
CREATE POLICY family_scope ON "family_profile"
  USING ("familyId" = app_family_id()) WITH CHECK ("familyId" = app_family_id());

ALTER TABLE "family_invitation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "family_invitation" FORCE ROW LEVEL SECURITY;
CREATE POLICY family_scope ON "family_invitation"
  USING ("familyId" = app_family_id()) WITH CHECK ("familyId" = app_family_id());

ALTER TABLE "task" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "task" FORCE ROW LEVEL SECURITY;
CREATE POLICY family_scope ON "task"
  USING ("familyId" = app_family_id()) WITH CHECK ("familyId" = app_family_id());

ALTER TABLE "birthday" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "birthday" FORCE ROW LEVEL SECURITY;
CREATE POLICY family_scope ON "birthday"
  USING ("familyId" = app_family_id()) WITH CHECK ("familyId" = app_family_id());

-- Assignments: task and profile must both belong to the active family
-- (the subqueries are themselves filtered by RLS).
ALTER TABLE "task_assignment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "task_assignment" FORCE ROW LEVEL SECURITY;
CREATE POLICY family_scope ON "task_assignment"
  USING ("familyId" = app_family_id())
  WITH CHECK (
    "familyId" = app_family_id()
    AND EXISTS (SELECT 1 FROM "task" t WHERE t."id" = "taskId" AND t."familyId" = app_family_id())
    AND EXISTS (SELECT 1 FROM "family_profile" p WHERE p."id" = "profileId" AND p."familyId" = app_family_id())
  );
