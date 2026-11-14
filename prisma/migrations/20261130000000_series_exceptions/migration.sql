-- Single instances of a series: a repeated calendar event can be moved or cancelled on one day
-- without changing the series, and a routine occurrence remembers the day it was moved away from.

CREATE TABLE "calendar_event_exception" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "cancelled" BOOLEAN NOT NULL DEFAULT false,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "startDate" DATE,
    "endDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "calendar_event_exception_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "calendar_event_exception_eventId_date_key" ON "calendar_event_exception"("eventId", "date");
CREATE INDEX "calendar_event_exception_familyId_idx" ON "calendar_event_exception"("familyId");

ALTER TABLE "calendar_event_exception" ADD CONSTRAINT "calendar_event_exception_eventId_familyId_fkey"
  FOREIGN KEY ("eventId", "familyId") REFERENCES "calendar_event"("id", "familyId") ON DELETE CASCADE ON UPDATE CASCADE;

GRANT SELECT, INSERT, UPDATE, DELETE ON "calendar_event_exception" TO plan4ju_app;
ALTER TABLE "calendar_event_exception" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "calendar_event_exception" FORCE ROW LEVEL SECURITY;
CREATE POLICY family_scope ON "calendar_event_exception"
  USING ("familyId" = app_family_id()) WITH CHECK ("familyId" = app_family_id());

ALTER TABLE "routine_occurrence" ADD COLUMN "movedFrom" DATE;
