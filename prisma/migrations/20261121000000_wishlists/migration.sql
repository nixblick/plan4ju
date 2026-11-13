-- Wish lists: lists per profile or person, wishes, reservations in their own table (surprise protection).
-- The birthday link is cleared on delete (SET NULL on the one column only; familyId stays).

-- CreateEnum
CREATE TYPE "WishVisibility" AS ENUM ('FAMILY', 'PRIVATE');

-- CreateEnum
CREATE TYPE "WishOccasion" AS ENUM ('ANY', 'BIRTHDAY', 'CHRISTMAS', 'EASTER', 'OTHER');

-- CreateTable
CREATE TABLE "wishlist" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "profileId" TEXT,
    "personName" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "visibility" "WishVisibility" NOT NULL DEFAULT 'FAMILY',
    "surprise" BOOLEAN NOT NULL DEFAULT true,
    "birthdayId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wishlist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wish" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "listId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "url" TEXT,
    "imageUrl" TEXT,
    "priceCents" INTEGER,
    "priority" INTEGER NOT NULL DEFAULT 2,
    "note" TEXT,
    "occasion" "WishOccasion" NOT NULL DEFAULT 'ANY',
    "received" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wish_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wish_reservation" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "wishId" TEXT NOT NULL,
    "reservedById" TEXT NOT NULL,
    "given" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wish_reservation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "wishlist_familyId_idx" ON "wishlist"("familyId");

-- CreateIndex
CREATE UNIQUE INDEX "wishlist_id_familyId_key" ON "wishlist"("id", "familyId");

-- CreateIndex
CREATE INDEX "wish_listId_idx" ON "wish"("listId");

-- CreateIndex
CREATE UNIQUE INDEX "wish_id_familyId_key" ON "wish"("id", "familyId");

-- CreateIndex
CREATE UNIQUE INDEX "wish_reservation_wishId_key" ON "wish_reservation"("wishId");

-- CreateIndex
CREATE INDEX "wish_reservation_familyId_idx" ON "wish_reservation"("familyId");

-- CreateIndex
CREATE UNIQUE INDEX "wish_reservation_wishId_familyId_key" ON "wish_reservation"("wishId", "familyId");

-- CreateIndex
CREATE UNIQUE INDEX "birthday_id_familyId_key" ON "birthday"("id", "familyId");

-- AddForeignKey
ALTER TABLE "wishlist" ADD CONSTRAINT "wishlist_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wishlist" ADD CONSTRAINT "wishlist_profileId_familyId_fkey" FOREIGN KEY ("profileId", "familyId") REFERENCES "family_profile"("id", "familyId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wishlist" ADD CONSTRAINT "wishlist_birthdayId_familyId_fkey" FOREIGN KEY ("birthdayId", "familyId") REFERENCES "birthday"("id", "familyId") ON DELETE SET NULL ("birthdayId") ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wish" ADD CONSTRAINT "wish_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wish" ADD CONSTRAINT "wish_listId_familyId_fkey" FOREIGN KEY ("listId", "familyId") REFERENCES "wishlist"("id", "familyId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wish_reservation" ADD CONSTRAINT "wish_reservation_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wish_reservation" ADD CONSTRAINT "wish_reservation_wishId_familyId_fkey" FOREIGN KEY ("wishId", "familyId") REFERENCES "wish"("id", "familyId") ON DELETE CASCADE ON UPDATE CASCADE;

