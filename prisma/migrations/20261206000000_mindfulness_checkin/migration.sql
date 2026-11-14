-- Mindfulness as one questionnaire (issue 15): one submit stores all ratings as one check-in.
-- Rows stay one per topic (RLS, shares and the health check are unchanged); checkinId groups them.
-- Existing rows each become their own check-in, so no row changes its content or visibility.

ALTER TABLE "mindfulness_entry" ADD COLUMN "checkinId" TEXT;
UPDATE "mindfulness_entry" SET "checkinId" = "id" WHERE "checkinId" IS NULL;
ALTER TABLE "mindfulness_entry" ALTER COLUMN "checkinId" SET NOT NULL;
CREATE INDEX "mindfulness_entry_familyId_checkinId_idx" ON "mindfulness_entry"("familyId", "checkinId");

-- Visibility is now a setting per user and family; new check-ins copy it into their rows.
CREATE TABLE "mindfulness_pref" (
    "familyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "visibility" "MindfulnessVisibility" NOT NULL DEFAULT 'PRIVATE',
    "viewerIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "mindfulness_pref_pkey" PRIMARY KEY ("familyId", "userId"),
    CONSTRAINT "mindfulness_pref_viewers_check" CHECK (cardinality("viewerIds") <= 20)
);
ALTER TABLE "mindfulness_pref" ADD CONSTRAINT "mindfulness_pref_membership_fkey"
  FOREIGN KEY ("familyId", "userId") REFERENCES "family_membership"("familyId", "userId") ON DELETE CASCADE ON UPDATE CASCADE;
