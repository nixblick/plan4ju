-- Map: categories (icon = key of the built-in icon set) and points of interest (docs/karte.md).
-- Starter categories are created by the service on first use, per family.


-- CreateTable
CREATE TABLE "map_category" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#c2410c',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "map_category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "poi" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "address" TEXT,
    "description" TEXT,
    "note" TEXT,
    "url" TEXT,
    "imageUrl" TEXT,
    "rating" INTEGER,
    "startDate" DATE,
    "endDate" DATE,
    "archivedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "poi_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "map_category_id_familyId_key" ON "map_category"("id", "familyId");

-- CreateIndex
CREATE UNIQUE INDEX "map_category_familyId_name_key" ON "map_category"("familyId", "name");

-- CreateIndex
CREATE INDEX "poi_familyId_archivedAt_idx" ON "poi"("familyId", "archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "poi_id_familyId_key" ON "poi"("id", "familyId");

-- AddForeignKey

-- AddForeignKey
ALTER TABLE "map_category" ADD CONSTRAINT "map_category_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "poi" ADD CONSTRAINT "poi_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "poi" ADD CONSTRAINT "poi_categoryId_familyId_fkey" FOREIGN KEY ("categoryId", "familyId") REFERENCES "map_category"("id", "familyId") ON DELETE NO ACTION ON UPDATE CASCADE;


-- Checks
ALTER TABLE "poi" ADD CONSTRAINT "poi_lat_check" CHECK ("lat" BETWEEN -90 AND 90);
ALTER TABLE "poi" ADD CONSTRAINT "poi_lng_check" CHECK ("lng" BETWEEN -180 AND 180);
ALTER TABLE "poi" ADD CONSTRAINT "poi_rating_check" CHECK ("rating" IS NULL OR "rating" BETWEEN 1 AND 5);
ALTER TABLE "poi" ADD CONSTRAINT "poi_dates_check" CHECK ("startDate" IS NULL OR "endDate" IS NULL OR "endDate" >= "startDate");
ALTER TABLE "map_category" ADD CONSTRAINT "map_category_color_check" CHECK ("color" ~ '^#[0-9a-f]{6}$');
