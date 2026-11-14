-- Assignment acceptance (issue 16): a profile assigned by someone else starts as PENDING and accepts or
-- declines. Self-assignments and child profiles without login are ACCEPTED right away.
-- Existing assignments were never offered for acceptance: they all become ACCEPTED (no "new" marker after rollout).

CREATE TYPE "AssignmentState" AS ENUM ('PENDING', 'ACCEPTED');

ALTER TABLE "task_assignment" ADD COLUMN "state" "AssignmentState" NOT NULL DEFAULT 'ACCEPTED';
ALTER TABLE "task_assignment" ADD COLUMN "assignedById" TEXT;
ALTER TABLE "task_assignment" ALTER COLUMN "state" SET DEFAULT 'PENDING';

-- A declined assignment: the row in task_assignment is removed, this record tells the assigning person.
CREATE TABLE "task_decline" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "declinedById" TEXT NOT NULL,
    "assignedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "task_decline_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "task_decline_familyId_assignedById_createdAt_idx" ON "task_decline"("familyId", "assignedById", "createdAt");
ALTER TABLE "task_decline" ADD CONSTRAINT "task_decline_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_decline" ADD CONSTRAINT "task_decline_declined_membership_fkey"
  FOREIGN KEY ("familyId", "declinedById") REFERENCES "family_membership"("familyId", "userId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_decline" ADD CONSTRAINT "task_decline_assigned_membership_fkey"
  FOREIGN KEY ("familyId", "assignedById") REFERENCES "family_membership"("familyId", "userId") ON DELETE CASCADE ON UPDATE CASCADE;
