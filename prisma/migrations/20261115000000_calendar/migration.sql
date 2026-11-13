-- CreateEnum
CREATE TYPE "CalendarKind" AS ENUM ('FILE', 'SUBSCRIPTION');

-- CreateTable
CREATE TABLE "calendar_event" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "startDate" DATE,
    "endDate" DATE,
    "freq" "RoutineFreq",
    "interval" INTEGER NOT NULL DEFAULT 1,
    "weekdays" INTEGER[],
    "monthDay" INTEGER,
    "repeatUntil" DATE,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calendar_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_event_participant" (
    "eventId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,

    CONSTRAINT "calendar_event_participant_pkey" PRIMARY KEY ("eventId","profileId")
);

-- CreateTable
CREATE TABLE "external_calendar" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "colorIndex" INTEGER NOT NULL DEFAULT 0,
    "kind" "CalendarKind" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "urlEnc" TEXT,
    "lastAttemptAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "lastError" TEXT,
    "eventCount" INTEGER NOT NULL DEFAULT 0,
    "truncated" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "external_calendar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_calendar_event" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "calendarId" TEXT NOT NULL,
    "uid" TEXT NOT NULL,
    "instanceKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "startDate" DATE,
    "endDate" DATE,

    CONSTRAINT "external_calendar_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "calendar_event_familyId_startsAt_idx" ON "calendar_event"("familyId", "startsAt");

-- CreateIndex
CREATE INDEX "calendar_event_familyId_startDate_idx" ON "calendar_event"("familyId", "startDate");

-- CreateIndex
CREATE UNIQUE INDEX "calendar_event_id_familyId_key" ON "calendar_event"("id", "familyId");

-- CreateIndex
CREATE INDEX "calendar_event_participant_familyId_idx" ON "calendar_event_participant"("familyId");

-- CreateIndex
CREATE INDEX "external_calendar_familyId_idx" ON "external_calendar"("familyId");

-- CreateIndex
CREATE UNIQUE INDEX "external_calendar_id_familyId_key" ON "external_calendar"("id", "familyId");

-- CreateIndex
CREATE INDEX "external_calendar_event_familyId_startsAt_idx" ON "external_calendar_event"("familyId", "startsAt");

-- CreateIndex
CREATE INDEX "external_calendar_event_familyId_startDate_idx" ON "external_calendar_event"("familyId", "startDate");

-- CreateIndex
CREATE UNIQUE INDEX "external_calendar_event_calendarId_uid_instanceKey_key" ON "external_calendar_event"("calendarId", "uid", "instanceKey");

-- CreateIndex
CREATE UNIQUE INDEX "family_profile_id_familyId_key" ON "family_profile"("id", "familyId");

-- AddForeignKey
ALTER TABLE "calendar_event" ADD CONSTRAINT "calendar_event_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_event_participant" ADD CONSTRAINT "calendar_event_participant_eventId_familyId_fkey" FOREIGN KEY ("eventId", "familyId") REFERENCES "calendar_event"("id", "familyId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_event_participant" ADD CONSTRAINT "calendar_event_participant_profileId_familyId_fkey" FOREIGN KEY ("profileId", "familyId") REFERENCES "family_profile"("id", "familyId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_calendar" ADD CONSTRAINT "external_calendar_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_calendar_event" ADD CONSTRAINT "external_calendar_event_calendarId_familyId_fkey" FOREIGN KEY ("calendarId", "familyId") REFERENCES "external_calendar"("id", "familyId") ON DELETE CASCADE ON UPDATE CASCADE;


-- Either an all-day event (local days, last day inclusive) or a timed one (UTC instants), never a mix.
ALTER TABLE "calendar_event" ADD CONSTRAINT "calendar_event_time_shape" CHECK (
  ("allDay" AND "startDate" IS NOT NULL AND "endDate" IS NOT NULL AND "endDate" >= "startDate")
  OR (NOT "allDay" AND "startsAt" IS NOT NULL AND "endsAt" IS NOT NULL AND "endsAt" >= "startsAt")
);
ALTER TABLE "external_calendar_event" ADD CONSTRAINT "external_calendar_event_time_shape" CHECK (
  ("allDay" AND "startDate" IS NOT NULL AND "endDate" IS NOT NULL AND "endDate" >= "startDate")
  OR (NOT "allDay" AND "startsAt" IS NOT NULL AND "endsAt" IS NOT NULL AND "endsAt" >= "startsAt")
);
