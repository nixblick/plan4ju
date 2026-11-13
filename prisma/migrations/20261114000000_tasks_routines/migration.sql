-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH');

-- CreateEnum
CREATE TYPE "RoutineFreq" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "RoutineStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "RoutineAssignMode" AS ENUM ('FIXED', 'ROTATING', 'PER_OCCURRENCE');

-- CreateEnum
CREATE TYPE "OccurrenceStatus" AS ENUM ('OPEN', 'DONE', 'SKIPPED');

-- AlterEnum
ALTER TYPE "TaskStatus" ADD VALUE 'IN_PROGRESS';

-- AlterTable
ALTER TABLE "task" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "dueTime" TEXT,
ADD COLUMN     "priority" "TaskPriority" NOT NULL DEFAULT 'NORMAL';

-- CreateTable
CREATE TABLE "routine" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "freq" "RoutineFreq" NOT NULL DEFAULT 'DAILY',
    "interval" INTEGER NOT NULL DEFAULT 1,
    "weekdays" INTEGER[],
    "monthDay" INTEGER,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "timeOfDay" TEXT,
    "assignMode" "RoutineAssignMode" NOT NULL DEFAULT 'FIXED',
    "status" "RoutineStatus" NOT NULL DEFAULT 'ACTIVE',
    "generatedUntil" DATE,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "routine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "routine_assignment" (
    "routineId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "routine_assignment_pkey" PRIMARY KEY ("routineId","profileId")
);

-- CreateTable
CREATE TABLE "routine_occurrence" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "routineId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "timeOfDay" TEXT,
    "status" "OccurrenceStatus" NOT NULL DEFAULT 'OPEN',
    "doneAt" TIMESTAMP(3),
    "doneById" TEXT,
    "customized" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "routine_occurrence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "routine_occurrence_assignment" (
    "occurrenceId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,

    CONSTRAINT "routine_occurrence_assignment_pkey" PRIMARY KEY ("occurrenceId","profileId")
);

-- CreateIndex
CREATE INDEX "routine_familyId_status_idx" ON "routine"("familyId", "status");

-- CreateIndex
CREATE INDEX "routine_assignment_familyId_idx" ON "routine_assignment"("familyId");

-- CreateIndex
CREATE INDEX "routine_occurrence_familyId_date_idx" ON "routine_occurrence"("familyId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "routine_occurrence_routineId_date_key" ON "routine_occurrence"("routineId", "date");

-- CreateIndex
CREATE INDEX "routine_occurrence_assignment_familyId_idx" ON "routine_occurrence_assignment"("familyId");

-- AddForeignKey
ALTER TABLE "routine" ADD CONSTRAINT "routine_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routine_assignment" ADD CONSTRAINT "routine_assignment_routineId_fkey" FOREIGN KEY ("routineId") REFERENCES "routine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routine_assignment" ADD CONSTRAINT "routine_assignment_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "family_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routine_occurrence" ADD CONSTRAINT "routine_occurrence_routineId_fkey" FOREIGN KEY ("routineId") REFERENCES "routine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routine_occurrence_assignment" ADD CONSTRAINT "routine_occurrence_assignment_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "routine_occurrence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routine_occurrence_assignment" ADD CONSTRAINT "routine_occurrence_assignment_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "family_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

