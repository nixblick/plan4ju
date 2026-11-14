-- Keep assignment rows inside one family at database level (like meal_cook): the profile must
-- belong to the row's familyId. Before, only the services checked it (assertProfiles).
-- Existing rows are validated by ADD CONSTRAINT; a cross-family row aborts the migration.
ALTER TABLE "task_assignment" DROP CONSTRAINT "task_assignment_profileId_fkey";
ALTER TABLE "task_assignment" ADD CONSTRAINT "task_assignment_profileId_familyId_fkey" FOREIGN KEY ("profileId", "familyId") REFERENCES "family_profile"("id", "familyId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "routine_assignment" DROP CONSTRAINT "routine_assignment_profileId_fkey";
ALTER TABLE "routine_assignment" ADD CONSTRAINT "routine_assignment_profileId_familyId_fkey" FOREIGN KEY ("profileId", "familyId") REFERENCES "family_profile"("id", "familyId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "routine_occurrence_assignment" DROP CONSTRAINT "routine_occurrence_assignment_profileId_fkey";
ALTER TABLE "routine_occurrence_assignment" ADD CONSTRAINT "routine_occurrence_assignment_profileId_familyId_fkey" FOREIGN KEY ("profileId", "familyId") REFERENCES "family_profile"("id", "familyId") ON DELETE CASCADE ON UPDATE CASCADE;
