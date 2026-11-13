-- Mindfulness: ratings per profile, local day and topic, with per-entry visibility and selected viewers.
-- See docs/achtsamkeit.md. Row level security follows in the next migration.

-- CreateEnum
CREATE TYPE "MindfulnessTopic" AS ENUM ('FOOD', 'SLEEP', 'MOOD', 'WORK', 'LEISURE', 'HEALTH');

-- CreateEnum
CREATE TYPE "MindfulnessVisibility" AS ENUM ('PRIVATE', 'SELECTED', 'FAMILY');

-- CreateTable
CREATE TABLE "mindfulness_entry" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "topic" "MindfulnessTopic" NOT NULL,
    "date" DATE NOT NULL,
    "rating" INTEGER NOT NULL,
    "note" TEXT,
    "visibility" "MindfulnessVisibility" NOT NULL DEFAULT 'PRIVATE',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mindfulness_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mindfulness_share" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "mindfulness_share_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mindfulness_entry_familyId_profileId_date_idx" ON "mindfulness_entry"("familyId", "profileId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "mindfulness_entry_id_familyId_key" ON "mindfulness_entry"("id", "familyId");

-- CreateIndex
CREATE UNIQUE INDEX "mindfulness_entry_id_familyId_createdById_key" ON "mindfulness_entry"("id", "familyId", "createdById");

-- CreateIndex
CREATE UNIQUE INDEX "mindfulness_entry_profileId_topic_date_createdById_key" ON "mindfulness_entry"("profileId", "topic", "date", "createdById");

-- CreateIndex
CREATE INDEX "mindfulness_share_familyId_userId_idx" ON "mindfulness_share"("familyId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "mindfulness_share_entryId_userId_key" ON "mindfulness_share"("entryId", "userId");

-- AddForeignKey
ALTER TABLE "mindfulness_entry" ADD CONSTRAINT "mindfulness_entry_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mindfulness_entry" ADD CONSTRAINT "mindfulness_entry_profileId_familyId_fkey" FOREIGN KEY ("profileId", "familyId") REFERENCES "family_profile"("id", "familyId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mindfulness_entry" ADD CONSTRAINT "mindfulness_entry_familyId_createdById_fkey" FOREIGN KEY ("familyId", "createdById") REFERENCES "family_membership"("familyId", "userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mindfulness_share" ADD CONSTRAINT "mindfulness_share_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mindfulness_share" ADD CONSTRAINT "mindfulness_share_entryId_familyId_ownerId_fkey" FOREIGN KEY ("entryId", "familyId", "ownerId") REFERENCES "mindfulness_entry"("id", "familyId", "createdById") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mindfulness_share" ADD CONSTRAINT "mindfulness_share_familyId_userId_fkey" FOREIGN KEY ("familyId", "userId") REFERENCES "family_membership"("familyId", "userId") ON DELETE CASCADE ON UPDATE CASCADE;


-- Checks: rating scale 1..5, short notes, health entries never visible to the whole family.
ALTER TABLE "mindfulness_entry" ADD CONSTRAINT "mindfulness_entry_rating_check" CHECK ("rating" BETWEEN 1 AND 5);
ALTER TABLE "mindfulness_entry" ADD CONSTRAINT "mindfulness_entry_note_check" CHECK ("note" IS NULL OR char_length("note") <= 1000);
ALTER TABLE "mindfulness_entry" ADD CONSTRAINT "mindfulness_entry_health_check" CHECK ("topic" <> 'HEALTH' OR "visibility" <> 'FAMILY');
ALTER TABLE "mindfulness_share" ADD CONSTRAINT "mindfulness_share_not_self_check" CHECK ("userId" <> "ownerId");
