-- Feedback from signed-in users (test phase). Family-scoped like every other table; the
-- author must be the current user. The screenshot is kept as bytea so nothing is lost when
-- mail delivery fails; there is no public path to it.
CREATE TYPE "FeedbackKind" AS ENUM ('BUG', 'IDEA', 'OTHER');

CREATE TABLE "feedback" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "FeedbackKind" NOT NULL,
    "message" TEXT NOT NULL,
    "authorName" TEXT,
    "pagePath" TEXT NOT NULL,
    "appVersion" TEXT NOT NULL,
    "device" TEXT NOT NULL,
    "screenWidth" INTEGER,
    "imageType" TEXT,
    "image" BYTEA,
    "mailedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "feedback_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "feedback_familyId_createdAt_idx" ON "feedback"("familyId", "createdAt");

ALTER TABLE "feedback" ADD CONSTRAINT "feedback_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

GRANT SELECT, INSERT, UPDATE ON "feedback" TO plan4ju_app;
ALTER TABLE "feedback" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "feedback" FORCE ROW LEVEL SECURITY;
CREATE POLICY family_scope ON "feedback"
  USING ("familyId" = app_family_id())
  WITH CHECK ("familyId" = app_family_id() AND "userId" = app_user_id());
