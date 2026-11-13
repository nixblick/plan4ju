-- In-app notifications, per-user settings and the private calendar feed (docs/benachrichtigungen.md).

CREATE TYPE "NotificationKind" AS ENUM ('TASK_DUE', 'ROUTINE_DUE', 'BIRTHDAY', 'ASSIGNED');

-- When a profile was assigned to a task; drives the "new assignment" notification. Existing rows get now().
ALTER TABLE "task_assignment" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE "notification" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "NotificationKind" NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "link" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),
    CONSTRAINT "notification_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "notification_title_len" CHECK (char_length("title") <= 300),
    CONSTRAINT "notification_link_local" CHECK ("link" LIKE '/%' AND "link" NOT LIKE '//%')
);
CREATE UNIQUE INDEX "notification_familyId_userId_dedupeKey_key" ON "notification"("familyId", "userId", "dedupeKey");
CREATE INDEX "notification_familyId_userId_readAt_idx" ON "notification"("familyId", "userId", "readAt");
ALTER TABLE "notification" ADD CONSTRAINT "notification_membership_fkey"
  FOREIGN KEY ("familyId", "userId") REFERENCES "family_membership"("familyId", "userId") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "notification_pref" (
    "familyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tasks" BOOLEAN NOT NULL DEFAULT true,
    "routines" BOOLEAN NOT NULL DEFAULT true,
    "birthdays" BOOLEAN NOT NULL DEFAULT true,
    "assignments" BOOLEAN NOT NULL DEFAULT true,
    "emailDigest" BOOLEAN NOT NULL DEFAULT false,
    "digestSentOn" DATE,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notification_pref_pkey" PRIMARY KEY ("familyId", "userId")
);
ALTER TABLE "notification_pref" ADD CONSTRAINT "notification_pref_membership_fkey"
  FOREIGN KEY ("familyId", "userId") REFERENCES "family_membership"("familyId", "userId") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "calendar_feed" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    CONSTRAINT "calendar_feed_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "calendar_feed_tokenHash_key" ON "calendar_feed"("tokenHash");
CREATE UNIQUE INDEX "calendar_feed_familyId_userId_key" ON "calendar_feed"("familyId", "userId");
ALTER TABLE "calendar_feed" ADD CONSTRAINT "calendar_feed_membership_fkey"
  FOREIGN KEY ("familyId", "userId") REFERENCES "family_membership"("familyId", "userId") ON DELETE CASCADE ON UPDATE CASCADE;
