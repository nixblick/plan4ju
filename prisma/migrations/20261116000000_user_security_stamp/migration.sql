-- Security stamp per user (issue 8): known-device cookies are signed with it, so changing it
-- invalidates every device cookie of that user. It changes on every password change or reset
-- (trigger below, covers the server actions and the /api/auth routes alike) and on
-- "sign out everywhere" (Better Auth hook in auth.ts).

ALTER TABLE "user" ADD COLUMN "securityStamp" TEXT NOT NULL DEFAULT gen_random_uuid()::text;

CREATE FUNCTION rotate_security_stamp_on_password() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."password" IS DISTINCT FROM OLD."password" THEN
    UPDATE "user" SET "securityStamp" = gen_random_uuid()::text WHERE "id" = NEW."userId";
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER account_password_rotates_stamp
  AFTER UPDATE OF "password" ON "account"
  FOR EACH ROW EXECUTE FUNCTION rotate_security_stamp_on_password();
